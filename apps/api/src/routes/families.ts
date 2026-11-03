// Families, members and invitations, plus instance-admin family invites.
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { langOf } from '../lib/i18n.ts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createFamilyBody, inviteBody, type Family } from '@kiddietube/shared'
import { withFamily, withSystem } from '../db/context.ts'
import * as s from '../db/schema.ts'
import { emails } from '../email.ts'
import { badRequest, forbidden, notFound } from '../http/errors.ts'
import { requireAdmin, requireMember, requireUser, toRole, touch, type AppContext } from '../http/context.ts'
import { newId, newSecret, sha256 } from '../lib/crypto.ts'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'family'

export async function familyRoutes(app: FastifyInstance, ctx: AppContext) {
  /** The signed-in parent and the families they belong to. */
  app.get('/api/v1/me', async (req) => {
    const user = await requireUser(ctx, req)
    const rows = await ctx.db
      .select({ id: s.organization.id, name: s.organization.name, role: s.member.role })
      .from(s.member)
      .innerJoin(s.organization, eq(s.organization.id, s.member.organizationId))
      .where(eq(s.member.userId, user.id))
    const families: Family[] = rows.map((r) => ({ id: r.id, name: r.name, role: toRole(r.role) }))
    return { user, families }
  })

  /**
   * Create a family. Allowed for instance admins, or with a valid family
   * invite token (sent by an admin), which is consumed. The creator becomes
   * the family's owner; the family starts empty.
   */
  app.post('/api/v1/families', async (req, reply) => {
    const user = await requireUser(ctx, req)
    const body = createFamilyBody.extend({ inviteToken: z.string().optional() }).parse(req.body)
    const familyId = newId('fam_')
    await withSystem(ctx.db, async (tx) => {
      if (!user.isAdmin) {
        if (!body.inviteToken) throw forbidden('A family invitation is required')
        const [inv] = await tx
          .select()
          .from(s.familyInvite)
          .where(
            and(
              eq(s.familyInvite.tokenHash, sha256(body.inviteToken)),
              isNull(s.familyInvite.usedAt),
              gt(s.familyInvite.expiresAt, new Date()),
            ),
          )
        if (!inv || inv.email !== user.email.toLowerCase()) throw forbidden('This invitation is not valid for your account')
        await tx.update(s.familyInvite).set({ usedAt: new Date() }).where(eq(s.familyInvite.id, inv.id))
      }
      await tx.insert(s.organization).values({ id: familyId, name: body.name, slug: `${slugify(body.name)}-${familyId.slice(4, 10)}` })
      await tx.insert(s.member).values({ id: newId('mem_'), organizationId: familyId, userId: user.id, role: 'owner' })
      await tx.insert(s.familyState).values({ familyId, feedVersion: 1 })
    })
    await withFamily(ctx.db, familyId, (tx) => touch(tx, familyId, user.id, 'create', 'family', familyId, { name: body.name }))
    return reply.status(201).send({ id: familyId, name: body.name, role: 'owner' } satisfies Family)
  })

  app.patch('/api/v1/families/:familyId', async (req) => {
    const { familyId } = z.object({ familyId: z.string() }).parse(req.params)
    const { user } = await requireMember(ctx, req, familyId, ['owner'])
    const body = createFamilyBody.parse(req.body)
    await ctx.db.update(s.organization).set({ name: body.name }).where(eq(s.organization.id, familyId))
    await withFamily(ctx.db, familyId, (tx) => touch(tx, familyId, user.id, 'rename', 'family', familyId, body))
    return { id: familyId, name: body.name, role: 'owner' } satisfies Family
  })

  /** Everything this family stores, as one JSON document (any parent). */
  app.get('/api/v1/families/:familyId/export', async (req, reply) => {
    const { familyId } = z.object({ familyId: z.string() }).parse(req.params)
    const { user } = await requireMember(ctx, req, familyId)
    const [fam] = await ctx.db.select().from(s.organization).where(eq(s.organization.id, familyId))
    const members = await ctx.db
      .select({ name: s.user.name, email: s.user.email, role: s.member.role, since: s.member.createdAt })
      .from(s.member)
      .innerJoin(s.user, eq(s.user.id, s.member.userId))
      .where(eq(s.member.organizationId, familyId))
    const data = await withFamily(ctx.db, familyId, async (tx) => {
      const out = {
        categories: await tx.select().from(s.category),
        videos: await tx.select().from(s.video),
        kidProfiles: await tx.select().from(s.kidProfile),
        kidProfileCategories: await tx.select().from(s.kidProfileCategory),
        // never export secrets (device key hashes, PIN hash)
        devices: (await tx.select().from(s.device)).map(({ keyHash: _k, ...d }) => d),
        auditLog: await tx.select().from(s.auditLog),
      }
      await touch(tx, familyId, user.id, 'export', 'family', familyId)
      return out
    })
    const doc = {
      format: 'kiddietube-family-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      family: { id: fam.id, name: fam.name, createdAt: fam.createdAt },
      members: members.map((m) => ({ ...m, role: toRole(m.role) })),
      ...data,
    }
    const file = `kiddietube-${slugify(fam.name)}-${new Date().toISOString().slice(0, 10)}.json`
    return reply.header('Content-Disposition', `attachment; filename="${file}"`).send(doc)
  })

  /**
   * Permanently delete a family and everything in it (owner only). The body
   * must repeat the family's name, so it can't happen by accident.
   */
  app.delete('/api/v1/families/:familyId', async (req, reply) => {
    const { familyId } = z.object({ familyId: z.string() }).parse(req.params)
    await requireMember(ctx, req, familyId, ['owner'])
    const { confirmName } = z.object({ confirmName: z.string() }).parse(req.body ?? {})
    const [fam] = await ctx.db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, familyId))
    if (!fam) throw notFound('Family not found')
    if (confirmName.trim() !== fam.name) throw badRequest('Type the family’s exact name to confirm')
    // Foreign keys cascade to every family-owned row (videos, categories,
    // kid profiles, devices, PIN, audit log, members, invitations).
    await ctx.db.delete(s.organization).where(eq(s.organization.id, familyId))
    req.log.info({ familyId }, 'family deleted')
    return reply.status(204).send()
  })

  /* ------------------------------- members ------------------------------ */

  app.get('/api/v1/families/:familyId/members', async (req) => {
    const { familyId } = z.object({ familyId: z.string() }).parse(req.params)
    await requireMember(ctx, req, familyId)
    const members = await ctx.db
      .select({ id: s.member.id, userId: s.user.id, name: s.user.name, email: s.user.email, role: s.member.role })
      .from(s.member)
      .innerJoin(s.user, eq(s.user.id, s.member.userId))
      .where(eq(s.member.organizationId, familyId))
    const invitations = await ctx.db
      .select({ id: s.invitation.id, email: s.invitation.email, role: s.invitation.role, expiresAt: s.invitation.expiresAt })
      .from(s.invitation)
      .where(and(eq(s.invitation.organizationId, familyId), eq(s.invitation.status, 'pending'), gt(s.invitation.expiresAt, new Date())))
    return {
      members: members.map((m) => ({ ...m, role: toRole(m.role) })),
      invitations: invitations.map((i) => ({ ...i, role: toRole(i.role ?? 'member'), expiresAt: i.expiresAt.toISOString() })),
    }
  })

  /** Invite another parent into this family (owners only). */
  app.post('/api/v1/families/:familyId/invitations', async (req, reply) => {
    const { familyId } = z.object({ familyId: z.string() }).parse(req.params)
    const { user } = await requireMember(ctx, req, familyId, ['owner'])
    const body = inviteBody.parse(req.body)
    const email = body.email.toLowerCase()
    const already = await ctx.db
      .select({ id: s.member.id })
      .from(s.member)
      .innerJoin(s.user, eq(s.user.id, s.member.userId))
      .where(and(eq(s.member.organizationId, familyId), eq(s.user.email, email)))
    if (already.length) throw badRequest('Already a member of this family')
    const id = newId('inv_')
    await ctx.db.insert(s.invitation).values({
      id,
      organizationId: familyId,
      email,
      role: body.role === 'owner' ? 'owner' : 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      inviterId: user.id,
    })
    const [fam] = await ctx.db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, familyId))
    await ctx.mailer.send(emails.memberInvite(email, user.name, fam.name, `${ctx.config.BASE_URL}/accept?invitation=${id}`, langOf(req.headers)))
    await withFamily(ctx.db, familyId, (tx) => touch(tx, familyId, user.id, 'invite', 'member', id, { email, role: body.role }))
    return reply.status(201).send({ id })
  })

  /** Accept an invitation addressed to the signed-in parent's email. */
  app.post('/api/v1/invitations/:id/accept', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const user = await requireUser(ctx, req)
    const [found] = await ctx.db.select().from(s.invitation).where(eq(s.invitation.id, id))
    if (!found || found.status !== 'pending' || found.expiresAt < new Date()) throw notFound('Invitation not found or expired')
    if (found.email !== user.email.toLowerCase()) throw forbidden('This invitation was sent to a different email')
    // Atomic and idempotent: only one request can flip it from pending (double
    // clicks, two tabs), and someone already in the family isn't added twice.
    const inv = await ctx.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(s.invitation)
        .set({ status: 'accepted' })
        .where(and(eq(s.invitation.id, id), eq(s.invitation.status, 'pending'), gt(s.invitation.expiresAt, new Date())))
        .returning()
      if (!claimed) throw notFound('Invitation not found or expired')
      await tx
        .insert(s.member)
        .values({ id: newId('mem_'), organizationId: claimed.organizationId, userId: user.id, role: claimed.role ?? 'member' })
        .onConflictDoNothing({ target: [s.member.organizationId, s.member.userId] })
      return claimed
    })
    await withFamily(ctx.db, inv.organizationId, (tx) => touch(tx, inv.organizationId, user.id, 'join', 'member', user.id))
    const [fam] = await ctx.db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, inv.organizationId))
    return { id: inv.organizationId, name: fam.name, role: toRole(inv.role ?? 'member') } satisfies Family
  })

  /** Remove a member (owners), or leave the family (yourself). The last owner can't leave. */
  app.delete('/api/v1/families/:familyId/members/:userId', async (req, reply) => {
    const { familyId, userId } = z.object({ familyId: z.string(), userId: z.string() }).parse(req.params)
    const { user, role } = await requireMember(ctx, req, familyId)
    if (userId !== user.id && role !== 'owner') throw forbidden('Requires the owner role')
    const owners = await ctx.db
      .select({ userId: s.member.userId })
      .from(s.member)
      .where(and(eq(s.member.organizationId, familyId), eq(s.member.role, 'owner')))
    if (owners.length === 1 && owners[0].userId === userId) throw badRequest('A family needs at least one owner')
    const r = await ctx.db
      .delete(s.member)
      .where(and(eq(s.member.organizationId, familyId), eq(s.member.userId, userId)))
      .returning({ id: s.member.id })
    if (!r.length) throw notFound('Member not found')
    await withFamily(ctx.db, familyId, (tx) => touch(tx, familyId, user.id, 'remove', 'member', userId))
    return reply.status(204).send()
  })

  /* --------------------------- instance admin --------------------------- */

  /** Invite someone to create their OWN family. The admin doesn't join it. */
  app.post('/api/v1/admin/family-invites', async (req, reply) => {
    const admin = await requireAdmin(ctx, req)
    const { email } = inviteBody.pick({ email: true }).parse(req.body)
    const token = newSecret()
    const id = newId('fin_')
    await withSystem(ctx.db, (tx) =>
      tx.insert(s.familyInvite).values({
        id,
        email: email.toLowerCase(),
        tokenHash: sha256(token),
        invitedBy: admin.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      }),
    )
    await ctx.mailer.send(emails.familyInvite(email, admin.name, `${ctx.config.BASE_URL}/join?invite=${token}`, langOf(req.headers)))
    return reply.status(201).send({ id })
  })

  app.get('/api/v1/admin/family-invites', async (req) => {
    await requireAdmin(ctx, req)
    const rows = await withSystem(ctx.db, (tx) => tx.select().from(s.familyInvite).orderBy(desc(s.familyInvite.createdAt)))
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      usedAt: r.usedAt?.toISOString() ?? null,
    }))
  })

  /** Families on this instance: names and sizes only, never their content. */
  app.get('/api/v1/admin/families', async (req) => {
    await requireAdmin(ctx, req)
    const fams = await ctx.db.select({ id: s.organization.id, name: s.organization.name, createdAt: s.organization.createdAt }).from(s.organization)
    const members = await ctx.db.select({ familyId: s.member.organizationId }).from(s.member)
    return fams.map((f) => ({
      id: f.id,
      name: f.name,
      createdAt: f.createdAt.toISOString(),
      members: members.filter((m) => m.familyId === f.id).length,
    }))
  })
}
