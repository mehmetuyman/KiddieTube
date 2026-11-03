// GET /api/v1/feed — everything a paired device needs to work offline:
// its kid profile, the categories it may see and their visible videos.
// Devices store it locally and re-fetch with If-None-Match; an unchanged
// family answers 304 with no body.
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Feed } from '@kiddietube/shared'
import { withFamily } from '../db/context.ts'
import * as s from '../db/schema.ts'
import { notFound } from '../http/errors.ts'
import { requireDevice, type AppContext } from '../http/context.ts'
import { toCategory } from './content.ts'

export async function feedRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/api/v1/feed', async (req, reply) => {
    const device = await requireDevice(ctx, req)

    const result = await withFamily(ctx.db, device.familyId, async (tx) => {
      const [state] = await tx.select({ v: s.familyState.feedVersion }).from(s.familyState)
      const version = `${device.kidProfileId}.${state?.v ?? 1}`
      if (req.headers['if-none-match'] === `"${version}"`) return { version, feed: null }

      const [profile] = await tx.select().from(s.kidProfile).where(eq(s.kidProfile.id, device.kidProfileId))
      if (!profile) throw notFound('Kid profile not found')

      const allowed = (
        await tx.select({ id: s.kidProfileCategory.categoryId }).from(s.kidProfileCategory).where(eq(s.kidProfileCategory.kidProfileId, profile.id))
      ).map((r) => r.id)
      const restrict = allowed.length > 0 // no rows = everything

      const categories = await tx
        .select()
        .from(s.category)
        .where(restrict ? inArray(s.category.id, allowed) : undefined)
        .orderBy(asc(s.category.sortOrder), asc(s.category.createdAt))

      const videos = await tx
        .select()
        .from(s.video)
        .where(
          and(
            eq(s.video.hidden, false),
            eq(s.video.status, 'ok'),
            // a restricted profile sees only its categories (uncategorised videos are hidden for it)
            restrict ? inArray(s.video.categoryId, allowed) : undefined,
          ),
        )
        .orderBy(desc(s.video.createdAt))

      const feed: Feed = {
        version,
        generatedAt: new Date().toISOString(),
        profile: { id: profile.id, name: profile.name, avatar: profile.avatar, defaultTheme: profile.defaultTheme },
        categories: categories.map(toCategory),
        videos: videos.map((v) => ({
          id: v.id,
          youtubeId: v.youtubeId,
          title: v.title,
          channel: v.channel,
          categoryId: v.categoryId,
          createdAt: v.createdAt.toISOString(),
        })),
      }
      return { version, feed }
    })

    reply.header('ETag', `"${result.version}"`).header('Cache-Control', 'no-cache')
    if (!result.feed) return reply.status(304).send()
    return result.feed
  })
}
