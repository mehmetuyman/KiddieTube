// Nightly availability check (deploy/kiddietube-check.timer runs it):
// asks YouTube (oEmbed) whether each video still exists and is embeddable.
// Videos that are gone/private/not embeddable become 'unavailable' (hidden
// from kids' feeds, tagged in the console); ones that come back are restored.
//
//   npm run check-videos -w @kiddietube/api            # all families
//   npm run check-videos -w @kiddietube/api -- --dry-run
//
// A video is only marked unavailable on a definite answer from YouTube
// (401/403/404). Network errors and other statuses leave it untouched.
import { parseArgs } from 'node:util'
import { eq } from 'drizzle-orm'
import { loadConfig } from '../config.ts'
import { openDb, type Db } from '../db/client.ts'
import { withFamily, withSystem } from '../db/context.ts'
import * as s from '../db/schema.ts'
import { touch } from '../http/context.ts'
import type { FetchLike } from '../lib/youtube.ts'

export type Availability = 'ok' | 'unavailable' | 'unknown'

export async function checkAvailability(youtubeId: string, fetchImpl: FetchLike = fetch): Promise<Availability> {
  const target = encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)
  try {
    const res = await fetchImpl(`https://www.youtube.com/oembed?url=${target}&format=json`, { signal: AbortSignal.timeout(8000) })
    if (res.ok) return 'ok'
    if ([401, 403, 404].includes(res.status)) return 'unavailable'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export interface CheckSummary {
  checked: number
  nowUnavailable: number
  restored: number
  unknown: number
}

export async function checkAllVideos(
  db: Db,
  opts: { dryRun?: boolean; fetchImpl?: FetchLike; delayMs?: number } = {},
): Promise<CheckSummary> {
  const videos = await withSystem(db, (tx) =>
    tx.select({ id: s.video.id, familyId: s.video.familyId, youtubeId: s.video.youtubeId, status: s.video.status }).from(s.video),
  )
  // One lookup per distinct YouTube id, even if several families have it.
  const byYoutubeId = new Map<string, Availability>()
  const summary: CheckSummary = { checked: 0, nowUnavailable: 0, restored: 0, unknown: 0 }
  for (const v of videos) {
    let a = byYoutubeId.get(v.youtubeId)
    if (!a) {
      a = await checkAvailability(v.youtubeId, opts.fetchImpl)
      byYoutubeId.set(v.youtubeId, a)
      summary.checked++
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs)) // be gentle with YouTube
    }
    if (a === 'unknown') {
      summary.unknown++
      continue
    }
    if (a === v.status) continue
    if (a === 'unavailable') summary.nowUnavailable++
    else summary.restored++
    if (opts.dryRun) continue
    await withFamily(db, v.familyId, async (tx) => {
      await tx.update(s.video).set({ status: a, updatedAt: new Date() }).where(eq(s.video.id, v.id))
      await touch(tx, v.familyId, null, a === 'ok' ? 'restored' : 'unavailable', 'video', v.id, { youtubeId: v.youtubeId })
    })
  }
  return summary
}

if (process.argv[1] && /check-videos\.ts$/.test(process.argv[1])) {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' } } })
  const config = loadConfig()
  const handle = await openDb(config.DATABASE_URL, { migrate: !config.DATABASE_URL?.startsWith('postgres') })
  try {
    const r = await checkAllVideos(handle.db, { dryRun: values['dry-run'], delayMs: 300 })
    console.log(
      `Checked ${r.checked} videos: ${r.nowUnavailable} became unavailable, ${r.restored} restored, ${r.unknown} could not be checked${values['dry-run'] ? ' (dry run)' : ''}.`,
    )
  } finally {
    await handle.close()
  }
}
