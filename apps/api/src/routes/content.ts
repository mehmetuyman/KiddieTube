// Family-scoped content: /api/v1/families/:familyId/...
// Every handler checks membership, then runs inside withFamily() so
// row-level security confines it to that family's rows.
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { isUniqueViolation } from '../db/errors.ts'
import { langOf, translate } from '../lib/i18n.ts'
import { mapLimit } from '../lib/async.ts'
import {
  createCategoryBody,
  createKidProfileBody,
  createVideoBody,
  importVideosBody,
  pairDeviceBody,
  parseYouTubeId,
  reorderBody,
  setPinBody,
  updateCategoryBody,
  updateKidProfileBody,
  updateVideoBody,
  verifyPinBody,
  type Category,
  type Device,
  type KidProfile,
  type Video,
} from '@kiddietube/shared'
import { withFamily, type Tx } from '../db/context.ts'
import * as s from '../db/schema.ts'
import { badRequest, conflict, notFound, tooMany } from '../http/errors.ts'
import { requireDevice, requireMember, touch, type AppContext } from '../http/context.ts'
import { hashPin, newId, newSecret, sha256, verifyPinHash } from '../lib/crypto.ts'

const params = z.object({ familyId: z.string().min(1), id: z.string().min(1).optional() })

export const toCategory = (r: typeof s.category.$inferSelect): Category => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  color: r.color,
  sortOrder: r.sortOrder,
})

export const toVideo = (r: typeof s.video.$inferSelect): Video => ({
  id: r.id,
  youtubeId: r.youtubeId,
  title: r.title,
  channel: r.channel,
  categoryId: r.categoryId,
  hidden: r.hidden,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
})

const toDevice = (r: typeof s.device.$inferSelect): Device => ({
  id: r.id,
  name: r.name,
  kidProfileId: r.kidProfileId,
  createdAt: r.createdAt.toISOString(),
  lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
  revoked: !!r.revokedAt,
})

async function loadProfiles(tx: Tx): Promise<KidProfile[]> {
  const profiles = await tx.select().from(s.kidProfile).orderBy(asc(s.kidProfile.createdAt))
  const links = await tx.select().from(s.kidProfileCategory)
  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    defaultTheme: p.defaultTheme,
    categoryIds: links.filter((l) => l.kidProfileId === p.id).map((l) => l.categoryId),
  }))
}

/** Category ids must belong to this family (RLS makes others invisible). */
async function assertCategories(tx: Tx, ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))]
  if (!wanted.length) return
  const found = await tx.select({ id: s.category.id }).from(s.category).where(inArray(s.category.id, wanted))
  if (found.length !== wanted.length) throw badRequest('Unknown category')
}

const PIN_MAX_ATTEMPTS = 5
const PIN_LOCK_MS = 5 * 60 * 1000
/** 5 min, then 10, 20, 40 ... capped at 2^8 x 5 min (~21 h); a correct PIN resets it. */
export const pinLockMs = (lockouts: number) => PIN_LOCK_MS * 2 ** Math.min(Math.max(lockouts - 1, 0), 8)

export async function contentRoutes(app: FastifyInstance, ctx: AppContext) {
  const base = '/api/v1/families/:familyId'

  /* ----------------------------- categories ----------------------------- */

  app.get(`${base}/categories`, async (req) => {
    const { familyId } = params.parse(req.params)
    await requireMember(ctx, req, familyId)
    return withFamily(ctx.db, familyId, async (tx) =>
      (await tx.select().from(s.category).orderBy(asc(s.category.sortOrder), asc(s.category.createdAt))).map(toCategory),
    )
  })

  app.post(`${base}/categories`, async (req, reply) => {
    const { familyId } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const body = createCategoryBody.parse(req.body)
    const row = await withFamily(ctx.db, familyId, async (tx) => {
      // RLS limits the aggregate to this family's categories
      const [{ max }] = await tx.select({ max: sql<number | null>`max(${s.category.sortOrder})` }).from(s.category)
      const [r] = await tx
        .insert(s.category)
        .values({ id: newId('cat_'), familyId, name: body.name, emoji: body.emoji, color: body.color ?? null, sortOrder: (max ?? -1) + 1 })
        .returning()
      await touch(tx, familyId, user.id, 'create', 'category', r.id, { name: r.name })
      return r
    })
    return reply.status(201).send(toCategory(row))
  })

  app.patch(`${base}/categories/:id`, async (req) => {
    const { familyId, id } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const body = updateCategoryBody.parse(req.body)
    return withFamily(ctx.db, familyId, async (tx) => {
      const [r] = await tx.update(s.category).set(body).where(eq(s.category.id, id!)).returning()
      if (!r) throw notFound('Category not found')
      await touch(tx, familyId, user.id, 'update', 'category', r.id, body)
      return toCategory(r)
    })
  })

  app.post(`${base}/categories/reorder`, async (req) => {
    const { familyId } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const { ids } = reorderBody.parse(req.body)
    return withFamily(ctx.db, familyId, async (tx) => {
      await assertCategories(tx, ids)
      for (const [i, cid] of ids.entries()) await tx.update(s.category).set({ sortOrder: i }).where(eq(s.category.id, cid))
      await touch(tx, familyId, user.id, 'reorder', 'category', null)
      return (await tx.select().from(s.category).orderBy(asc(s.category.sortOrder))).map(toCategory)
    })
  })

  app.delete(`${base}/categories/:id`, async (req, reply) => {
    const { familyId, id } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    await withFamily(ctx.db, familyId, async (tx) => {
      const r = await tx.delete(s.category).where(eq(s.category.id, id!)).returning({ id: s.category.id })
      if (!r.length) throw notFound('Category not found')
      await touch(tx, familyId, user.id, 'delete', 'category', id!) // its videos become uncategorised
    })
    return reply.status(204).send()
  })

  /* ------------------------------- videos ------------------------------- */

  app.get(`${base}/videos`, async (req) => {
    const { familyId } = params.parse(req.params)
    await requireMember(ctx, req, familyId)
    return withFamily(ctx.db, familyId, async (tx) =>
      (await tx.select().from(s.video).orderBy(desc(s.video.createdAt))).map(toVideo),
    )
  })

  const DUPLICATE = 'That video is already in the list'

  async function existingYoutubeIds(familyId: string, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set()
    const rows = await withFamily(ctx.db, familyId, (tx) =>
      tx.select({ y: s.video.youtubeId }).from(s.video).where(inArray(s.video.youtubeId, ids)),
    )
    return new Set(rows.map((r) => r.y))
  }

  /**
   * Resolve a link to an insertable video. The YouTube lookup happens here,
   * outside any database transaction, so a slow lookup never holds a pooled
   * connection open.
   */
  async function prepareVideo(youtubeId: string, title?: string) {
    const meta = await ctx.fetchMeta(youtubeId)
    const finalTitle = title?.trim() || meta?.title || ''
    if (!finalTitle) throw badRequest('Could not find this video (private, deleted or not embeddable?). Enter a title to add it anyway.')
    return { youtubeId, title: finalTitle, channel: meta?.channel || null }
  }

  async function insertVideo(
    tx: Tx,
    familyId: string,
    userId: string,
    v: { youtubeId: string; title: string; channel: string | null },
    categoryId?: string | null,
  ) {
    try {
      const [r] = await tx
        .insert(s.video)
        .values({
          id: newId('vid_'),
          familyId,
          ...v,
          categoryId: categoryId ?? null,
          // 'unavailable' is only set by an explicit availability check, never
          // because a lookup failed (e.g. a brief network problem)
          status: 'ok',
          addedBy: userId,
        })
        .returning()
      return r
    } catch (e) {
      // two parents adding the same link at the same moment
      if (isUniqueViolation(e)) throw conflict(DUPLICATE)
      throw e
    }
  }

  app.post(`${base}/videos`, async (req, reply) => {
    const { familyId } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const body = createVideoBody.parse(req.body)
    const youtubeId = parseYouTubeId(body.url)
    if (!youtubeId) throw badRequest('Not a YouTube link or video id')
    if ((await existingYoutubeIds(familyId, [youtubeId])).size) throw conflict(DUPLICATE)
    const v = await prepareVideo(youtubeId, body.title)
    const row = await withFamily(ctx.db, familyId, async (tx) => {
      await assertCategories(tx, [body.categoryId])
      const r = await insertVideo(tx, familyId, user.id, v, body.categoryId)
      await touch(tx, familyId, user.id, 'create', 'video', r.id, { youtubeId: r.youtubeId })
      return r
    })
    return reply.status(201).send(toVideo(row))
  })

  /** Add many links at once; reports per-link results instead of failing the batch. */
  app.post(`${base}/videos/import`, async (req) => {
    const { familyId } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const body = importVideosBody.parse(req.body)
    await withFamily(ctx.db, familyId, (tx) => assertCategories(tx, [body.categoryId]))
    const lang = langOf(req.headers)
    const fail = (url: string, message: string) => ({ url, ok: false as const, error: translate(message, lang) })

    // Same link pasted twice: report it once.
    const urls = [...new Set(body.urls)]
    const ids = urls.map((u) => parseYouTubeId(u))
    const existing = await existingYoutubeIds(familyId, ids.filter((x): x is string => !!x))
    const seen = new Set<string>()

    // Lookups first, a few at a time and outside any transaction...
    const prepared = await mapLimit(urls, 4, async (url, i) => {
      const youtubeId = ids[i]
      if (!youtubeId) return fail(url, 'Not a YouTube link or video id')
      if (existing.has(youtubeId) || seen.has(youtubeId)) return fail(url, DUPLICATE)
      seen.add(youtubeId)
      try {
        return { url, ok: true as const, v: await prepareVideo(youtubeId) }
      } catch (e) {
        return fail(url, (e as Error).message)
      }
    })

    // ...then one short transaction per video.
    const results: { url: string; ok: boolean; video?: Video; error?: string }[] = []
    for (const p of prepared) {
      if (!p.ok) {
        results.push(p)
        continue
      }
      try {
        const r = await withFamily(ctx.db, familyId, async (tx) => {
          const row = await insertVideo(tx, familyId, user.id, p.v, body.categoryId)
          await touch(tx, familyId, user.id, 'import', 'video', row.id, { youtubeId: row.youtubeId })
          return row
        })
        results.push({ url: p.url, ok: true, video: toVideo(r) })
      } catch (e) {
        results.push(fail(p.url, (e as Error).message))
      }
    }
    return { results }
  })

  app.patch(`${base}/videos/:id`, async (req) => {
    const { familyId, id } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const body = updateVideoBody.parse(req.body)
    return withFamily(ctx.db, familyId, async (tx) => {
      await assertCategories(tx, [body.categoryId])
      const [r] = await tx.update(s.video).set({ ...body, updatedAt: new Date() }).where(eq(s.video.id, id!)).returning()
      if (!r) throw notFound('Video not found')
      await touch(tx, familyId, user.id, 'update', 'video', r.id, body)
      return toVideo(r)
    })
  })

  app.delete(`${base}/videos/:id`, async (req, reply) => {
    const { familyId, id } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    await withFamily(ctx.db, familyId, async (tx) => {
      const r = await tx.delete(s.video).where(eq(s.video.id, id!)).returning({ youtubeId: s.video.youtubeId })
      if (!r.length) throw notFound('Video not found')
      await touch(tx, familyId, user.id, 'delete', 'video', id!, { youtubeId: r[0].youtubeId })
    })
    return reply.status(204).send()
  })

  /* ---------------------------- kid profiles ---------------------------- */

  app.get(`${base}/profiles`, async (req) => {
    const { familyId } = params.parse(req.params)
    await requireMember(ctx, req, familyId)
    return withFamily(ctx.db, familyId, loadProfiles)
  })

  async function setProfileCategories(tx: Tx, familyId: string, kidProfileId: string, ids: string[]) {
    await assertCategories(tx, ids)
    await tx.delete(s.kidProfileCategory).where(eq(s.kidProfileCategory.kidProfileId, kidProfileId))
    if (ids.length) await tx.insert(s.kidProfileCategory).values(ids.map((categoryId) => ({ familyId, kidProfileId, categoryId })))
  }

  app.post(`${base}/profiles`, async (req, reply) => {
    const { familyId } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const body = createKidProfileBody.parse(req.body)
    const profile = await withFamily(ctx.db, familyId, async (tx) => {
      const [p] = await tx
        .insert(s.kidProfile)
        .values({ id: newId('kid_'), familyId, name: body.name, avatar: body.avatar ?? null, defaultTheme: body.defaultTheme ?? null })
        .returning()
      await setProfileCategories(tx, familyId, p.id, body.categoryIds ?? [])
      await touch(tx, familyId, user.id, 'create', 'kid_profile', p.id, { name: p.name })
      return (await loadProfiles(tx)).find((x) => x.id === p.id)!
    })
    return reply.status(201).send(profile)
  })

  app.patch(`${base}/profiles/:id`, async (req) => {
    const { familyId, id } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const { categoryIds, ...fields } = updateKidProfileBody.parse(req.body)
    return withFamily(ctx.db, familyId, async (tx) => {
      const exists = await tx.select({ id: s.kidProfile.id }).from(s.kidProfile).where(eq(s.kidProfile.id, id!))
      if (!exists.length) throw notFound('Profile not found')
      if (Object.keys(fields).length) await tx.update(s.kidProfile).set(fields).where(eq(s.kidProfile.id, id!))
      if (categoryIds) await setProfileCategories(tx, familyId, id!, categoryIds)
      await touch(tx, familyId, user.id, 'update', 'kid_profile', id!, { ...fields, categoryIds })
      return (await loadProfiles(tx)).find((x) => x.id === id)!
    })
  })

  app.delete(`${base}/profiles/:id`, async (req, reply) => {
    const { familyId, id } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    await withFamily(ctx.db, familyId, async (tx) => {
      const r = await tx.delete(s.kidProfile).where(eq(s.kidProfile.id, id!)).returning({ id: s.kidProfile.id })
      if (!r.length) throw notFound('Profile not found')
      await touch(tx, familyId, user.id, 'delete', 'kid_profile', id!) // its devices are removed too
    })
    return reply.status(204).send()
  })

  /* ------------------------------- devices ------------------------------ */

  app.get(`${base}/devices`, async (req) => {
    const { familyId } = params.parse(req.params)
    await requireMember(ctx, req, familyId)
    return withFamily(ctx.db, familyId, async (tx) =>
      (await tx.select().from(s.device).orderBy(desc(s.device.createdAt))).map(toDevice),
    )
  })

  /** Pair the device the parent is holding with a kid profile. The key is shown once. */
  app.post(`${base}/devices`, async (req, reply) => {
    const { familyId } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const body = pairDeviceBody.parse(req.body)
    const deviceKey = newSecret()
    const row = await withFamily(ctx.db, familyId, async (tx) => {
      const p = await tx.select({ id: s.kidProfile.id }).from(s.kidProfile).where(eq(s.kidProfile.id, body.kidProfileId))
      if (!p.length) throw badRequest('Unknown kid profile')
      const [d] = await tx
        .insert(s.device)
        .values({ id: newId('dev_'), familyId, kidProfileId: body.kidProfileId, name: body.name, keyHash: sha256(deviceKey) })
        .returning()
      await touch(tx, familyId, user.id, 'pair', 'device', d.id, { name: d.name, kidProfileId: d.kidProfileId })
      return d
    })
    return reply.status(201).send({ device: toDevice(row), deviceKey })
  })

  app.post(`${base}/devices/:id/revoke`, async (req) => {
    const { familyId, id } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    return withFamily(ctx.db, familyId, async (tx) => {
      const [d] = await tx.update(s.device).set({ revokedAt: new Date() }).where(eq(s.device.id, id!)).returning()
      if (!d) throw notFound('Device not found')
      await touch(tx, familyId, user.id, 'revoke', 'device', d.id, { name: d.name })
      return toDevice(d)
    })
  })

  /* ----------------------------- parent PIN ----------------------------- */

  app.get(`${base}/pin`, async (req) => {
    const { familyId } = params.parse(req.params)
    await requireMember(ctx, req, familyId)
    return withFamily(ctx.db, familyId, async (tx) => ({
      set: (await tx.select({ f: s.parentPin.familyId }).from(s.parentPin)).length > 0,
    }))
  })

  app.put(`${base}/pin`, async (req) => {
    const { familyId } = params.parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const { pin } = setPinBody.parse(req.body)
    return withFamily(ctx.db, familyId, async (tx) => {
      if (pin === null) {
        await tx.delete(s.parentPin)
      } else {
        const pinHash = await hashPin(pin)
        await tx
          .insert(s.parentPin)
          .values({ familyId, pinHash })
          .onConflictDoUpdate({ target: s.parentPin.familyId, set: { pinHash, failedAttempts: 0, lockouts: 0, lockedUntil: null } })
      }
      await touch(tx, familyId, user.id, pin === null ? 'remove' : 'set', 'parent_pin', null)
      return { set: pin !== null }
    })
  })

  /** For a paired device: does this family have a parent PIN? */
  app.get('/api/v1/device/pin', async (req) => {
    const d = await requireDevice(ctx, req)
    return withFamily(ctx.db, d.familyId, async (tx) => ({
      set: (await tx.select({ f: s.parentPin.familyId }).from(s.parentPin)).length > 0,
    }))
  })

  /**
   * Check the PIN a device asks for before opening parent mode. Used by
   * devices (device key) as well as parents; lockout after repeated misses.
   */
  app.post(`${base}/pin/verify`, async (req) => {
    const { familyId } = params.parse(req.params)
    const { pin } = verifyPinBody.parse(req.body)
    // a parent of this family, or a device paired to it
    if (req.headers.authorization?.startsWith('Device ')) {
      const d = await requireDevice(ctx, req)
      if (d.familyId !== familyId) throw notFound('Not found')
    } else {
      await requireMember(ctx, req, familyId)
    }
    return withFamily(ctx.db, familyId, async (tx) => {
      // FOR UPDATE: parallel guesses wait for each other, so every miss is
      // counted and the lockout can't be raced
      const [row] = await tx.select().from(s.parentPin).for('update')
      if (!row) return { ok: true }
      if (row.lockedUntil && row.lockedUntil > new Date()) throw tooMany('Too many wrong PINs. Try again in a few minutes.')
      const ok = await verifyPinHash(pin, row.pinHash)
      if (ok) {
        await tx.update(s.parentPin).set({ failedAttempts: 0, lockouts: 0, lockedUntil: null }).where(eq(s.parentPin.familyId, familyId))
        return { ok }
      }
      const failed = row.failedAttempts + 1
      const locks = failed >= PIN_MAX_ATTEMPTS
      const lockouts = locks ? row.lockouts + 1 : row.lockouts
      await tx
        .update(s.parentPin)
        .set({
          failedAttempts: locks ? 0 : failed,
          lockouts,
          lockedUntil: locks ? new Date(Date.now() + pinLockMs(lockouts)) : null,
        })
        .where(eq(s.parentPin.familyId, familyId))
      if (locks) await touch(tx, familyId, null, 'locked', 'parent_pin', null, { lockouts })
      return { ok }
    })
  })
}
