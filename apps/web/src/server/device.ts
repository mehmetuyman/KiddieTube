// This device's pairing and its offline copy of the feed (server mode).
//
// Offline-first: the kids' page always renders from the stored feed, then
// syncs in the background. If the home server is down, nothing changes for
// the child; videos stream from YouTube regardless.
import { API_PREFIX } from '@kiddietube/shared/constants'
import type { Feed } from '@kiddietube/shared'
import { ApiRequestError, request } from './api'

const LS_PAIRING = 'kt-device'
const LS_FEED = 'kt-feed'

export interface Pairing {
  deviceId: string
  familyId: string
  kidProfileId: string
  key: string
  name: string
}

const read = <T>(k: string): T | null => {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
const write = (k: string, v: unknown) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage full/blocked: the app still works for this session */
  }
}

export const getPairing = () => read<Pairing>(LS_PAIRING)
export const getStoredFeed = () => read<Feed>(LS_FEED)

export function savePairing(p: Pairing) {
  write(LS_PAIRING, p)
  write(LS_FEED, null) // new profile: fetch its own feed
}

export function clearPairing() {
  write(LS_PAIRING, null)
  write(LS_FEED, null)
}

export type SyncResult = 'updated' | 'unchanged' | 'offline' | 'unpaired' | 'revoked'

/**
 * Fetch the feed if it changed. Short timeout: a sleeping home server must
 * never hold up the kids' page.
 */
export async function syncFeed(timeoutMs = 4000): Promise<{ result: SyncResult; feed: Feed | null }> {
  const pairing = getPairing()
  if (!pairing) return { result: 'unpaired', feed: null }
  const stored = getStoredFeed()
  try {
    const res = await request<Response>('GET', `${API_PREFIX}/feed`, undefined, {
      raw: true,
      timeoutMs,
      headers: {
        authorization: `Device ${pairing.key}`,
        ...(stored ? { 'if-none-match': `"${stored.version}"` } : {}),
      },
    })
    if (res.status === 304) return { result: 'unchanged', feed: stored }
    if (res.status === 401) {
      clearPairing() // revoked by a parent (lost/handed-down device)
      return { result: 'revoked', feed: null }
    }
    if (!res.ok) return { result: 'offline', feed: stored }
    const feed = (await res.json()) as Feed
    write(LS_FEED, feed)
    return { result: 'updated', feed }
  } catch (e) {
    if (e instanceof ApiRequestError && e.offline) return { result: 'offline', feed: stored }
    return { result: 'offline', feed: stored }
  }
}

/** Ask the server whether `pin` is this family's parent PIN (via the device key). */
/**
 * Retire a pairing on the server (a signed-in parent of that family is
 * needed). Best effort: a 404 (already gone) or a family the parent isn't in
 * is ignored.
 */
export async function revokeDevice(p: Pick<Pairing, 'familyId' | 'deviceId'>): Promise<void> {
  await request('POST', `${API_PREFIX}/families/${p.familyId}/devices/${p.deviceId}/revoke`, {}).catch(() => {})
}

/** Does this device's family have a parent PIN? (Throws when the server can't say.) */
export async function devicePinIsSet(): Promise<boolean> {
  const p = getPairing()
  if (!p) return false
  const r = await request<{ set: boolean }>('GET', `${API_PREFIX}/device/pin`, undefined, {
    headers: { authorization: `Device ${p.key}` },
  })
  return r.set
}

export async function verifyPinWithDevice(pin: string): Promise<boolean> {
  const p = getPairing()
  if (!p) return true
  const r = await request<{ ok: boolean }>('POST', `${API_PREFIX}/families/${p.familyId}/pin/verify`, { pin }, {
    headers: { authorization: `Device ${p.key}` },
  })
  return r.ok
}

/**
 * Keep the kids' page in sync: render the stored feed immediately, then
 * re-check the server now, whenever the app comes back to the foreground,
 * and every 10 minutes while visible. Returns a stop function.
 */
export function startFeedSync(onFeed: (feed: Feed) => void, onUnpaired: () => void): () => void {
  const stored = getStoredFeed()
  if (stored) onFeed(stored)
  let stopped = false
  const run = async () => {
    if (stopped || document.visibilityState === 'hidden') return
    const { result, feed } = await syncFeed()
    if (stopped) return
    if (result === 'updated' && feed) onFeed(feed)
    if (result === 'revoked' || result === 'unpaired') onUnpaired()
  }
  void run()
  const onVisible = () => document.visibilityState === 'visible' && void run()
  document.addEventListener('visibilitychange', onVisible)
  const timer = window.setInterval(run, 10 * 60 * 1000)
  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(timer)
  }
}
