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
// YouTube also answers 403 when it throttles or blocks a server, so a run
// where too many videos suddenly look unavailable is treated as a YouTube
// problem: nothing is written and the run fails loudly [review M4].
import { parseArgs } from 'node:util'
import { and, eq, lt } from 'drizzle-orm'
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
  /** Set when the run was abandoned without changes (see MAX_NEWLY_UNAVAILABLE). */
  aborted?: string
}

/** More than this share of checked videos newly unavailable = YouTube is refusing us, not the videos. */
export const MAX_NEWLY_UNAVAILABLE = 0.2
/** ...once at least this many were checked (a tiny library can lose 1 of 3 for real). */
const BREAKER_MIN_CHECKED = 10

export async function checkAllVideos(
  db: Db,
  opts: { dryRun?: boolean; fetchImpl?: FetchLike; delayMs?: number } = {},
): Promise<CheckSummary> {
  const videos = await withSystem(db, (tx) =>
    tx.select({ id: s.video.id, familyId: s.video.familyId, youtubeId: s.video.youtubeId, status: s.video.status }).from(s.video),
  )
  // 1. Ask YouTube: one lookup per distinct id, even if several families have it.
  const byYoutubeId = new Map<string, Availability>()
  const summary: CheckSummary = { checked: 0, nowUnavailable: 0, restored: 0, unknown: 0 }
  for (const v of videos) {
    if (byYoutubeId.has(v.youtubeId)) continue
    byYoutubeId.set(v.youtubeId, await checkAvailability(v.youtubeId, opts.fetchImpl))
    summary.checked++
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs)) // be gentle with YouTube
  }

  // 2. Work out the changes.
  const changes: { v: (typeof videos)[number]; a: 'ok' | 'unavailable' }[] = []
  const newlyUnavailableIds = new Set<string>()
  for (const v of videos) {
    const a = byYoutubeId.get(v.youtubeId)!
    if (a === 'unknown') {
      summary.unknown++
      continue
    }
    if (a === v.status) continue
    if (a === 'unavailable') {
      summary.nowUnavailable++
      newlyUnavailableIds.add(v.youtubeId)
    } else summary.restored++
    changes.push({ v, a })
  }

  // 3. Circuit breaker: a mass "unavailable" is YouTube refusing us, not the videos.
  if (summary.checked >= BREAKER_MIN_CHECKED && newlyUnavailableIds.size / summary.checked > MAX_NEWLY_UNAVAILABLE) {
    summary.aborted = `${newlyUnavailableIds.size} of ${summary.checked} videos suddenly look unavailable; YouTube is probably throttling this server. Nothing was changed.`
    return summary
  }

  // 4. Apply.
  if (opts.dryRun) return summary
  for (const { v, a } of changes) {
    await withFamily(db, v.familyId, async (tx) => {
      await tx.update(s.video).set({ status: a, updatedAt: new Date() }).where(eq(s.video.id, v.id))
      await touch(tx, v.familyId, null, a === 'ok' ? 'restored' : 'unavailable', 'video', v.id, { youtubeId: v.youtubeId })
    })
  }
  return summary
}

/**
 * Remove accounts whose password was never chosen from the emailed link
 * (started sign-ups that were never finished), once they're a week old.
 * They can't sign in and hold nothing; signing up again just starts over.
 */
export async function pruneUnfinishedAccounts(db: Db, olderThanMs = 7 * 24 * 3600 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs)
  const gone = await db
    .delete(s.user)
    .where(and(eq(s.user.emailVerified, false), lt(s.user.createdAt, cutoff)))
    .returning({ id: s.user.id })
  return gone.length
}

if (process.argv[1] && /check-videos\.ts$/.test(process.argv[1])) {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' } } })
  const config = loadConfig()
  const handle = await openDb(config.DATABASE_URL, { migrate: !config.DATABASE_URL?.startsWith('postgres') })
  try {
    const r = await checkAllVideos(handle.db, { dryRun: values['dry-run'], delayMs: 300 })
    if (r.aborted) {
      console.error(`ABORTED: ${r.aborted}`)
      process.exitCode = 1 // shows as failed in systemctl / journalctl
    } else {
      console.log(
        `Checked ${r.checked} videos: ${r.nowUnavailable} became unavailable, ${r.restored} restored, ${r.unknown} could not be checked${values['dry-run'] ? ' (dry run)' : ''}.`,
      )
    }
    if (!values['dry-run']) {
      const pruned = await pruneUnfinishedAccounts(handle.db)
      if (pruned) console.log(`Removed ${pruned} unfinished sign-up(s) older than a week.`)
    }
  } finally {
    await handle.close()
  }
}
