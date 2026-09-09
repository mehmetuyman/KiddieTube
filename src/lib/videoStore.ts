// Video list storage + sync.
//
// Source of truth priority when loading:
//   1. Shared GitHub Gist  (if a token + gist id are configured on this device)
//   2. localStorage cache  (last known good list)
//   3. Bundled public/videos.json  (the seed list shipped with the app)
//
// Edits made in the Parent Panel are written back to the Gist (so other devices
// pick them up on next open) and mirrored to the localStorage cache for offline
// use. With no Gist configured, edits persist to the cache on this device only.

export type Video = {
  id: string
  title: string
  category: string
  channel?: string
  addedAt?: string
}

export type VideoDoc = {
  version: number
  updatedAt: string
  videos: Video[]
}

export type GistConfig = {
  gistId: string
  token: string
  filename: string
}

export type LoadSource = 'gist' | 'cache' | 'seed'
export type LoadResult = { doc: VideoDoc; source: LoadSource }

const LS_GIST = 'kiddietube-gist-config'
const LS_CACHE = 'kiddietube-videos-cache'
const LS_PIN = 'kiddietube-parent-pin'

const DEFAULT_FILENAME = 'kiddietube-videos.json'
const DOC_VERSION = 2
const GH_API = 'https://api.github.com'

/* ------------------------------------------------------------------ */
/* Gist configuration (per device)                                     */
/* ------------------------------------------------------------------ */

export function getGistConfig(): GistConfig | null {
  try {
    const raw = localStorage.getItem(LS_GIST)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (!c || typeof c.token !== 'string' || !c.token) return null
    return {
      gistId: typeof c.gistId === 'string' ? c.gistId : '',
      token: c.token,
      filename: typeof c.filename === 'string' && c.filename ? c.filename : DEFAULT_FILENAME,
    }
  } catch {
    return null
  }
}

export function setGistConfig(c: GistConfig | null): void {
  try {
    if (!c) localStorage.removeItem(LS_GIST)
    else localStorage.setItem(LS_GIST, JSON.stringify(c))
  } catch {
    /* storage unavailable - nothing we can do */
  }
}

export function isGistConfigured(): boolean {
  const c = getGistConfig()
  return !!(c && c.token && c.gistId)
}

/* ------------------------------------------------------------------ */
/* Optional parent PIN (local deterrent, not real security)            */
/* ------------------------------------------------------------------ */

function hashPin(pin: string): string {
  let h = 5381
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) + h + pin.charCodeAt(i)) >>> 0
  }
  return 'h' + h.toString(16)
}

export function hasPin(): boolean {
  try {
    return !!localStorage.getItem(LS_PIN)
  } catch {
    return false
  }
}

export function setPin(pin: string | null): void {
  try {
    if (!pin) localStorage.removeItem(LS_PIN)
    else localStorage.setItem(LS_PIN, hashPin(pin))
  } catch {
    /* ignore */
  }
}

export function verifyPin(pin: string): boolean {
  try {
    const stored = localStorage.getItem(LS_PIN)
    if (!stored) return true
    return stored === hashPin(pin)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* YouTube helpers                                                     */
/* ------------------------------------------------------------------ */

const ID_RE = /^[A-Za-z0-9_-]{11}$/

/** Extract an 11-char YouTube video id from a URL, embed code, or bare id. */
export function parseYouTubeId(input: string): string | null {
  if (!input) return null
  const s = input.trim()
  if (ID_RE.test(s)) return s

  const patterns = [
    /youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/|v\/)([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m && m[1]) return m[1]
  }
  return null
}

export function thumbUrl(id: string): string {
  return `https://img.youtube.com/vi/${id}/mqdefault.jpg`
}

/** Fetch the video title + channel from YouTube's public oEmbed endpoint. */
export async function fetchYouTubeMeta(
  id: string,
): Promise<{ title: string; channel: string } | null> {
  try {
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)
    const res = await fetch(`https://www.youtube.com/oembed?url=${target}&format=json`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      title: typeof data.title === 'string' ? data.title : '',
      channel: typeof data.author_name === 'string' ? data.author_name : '',
    }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Doc normalisation + cache                                           */
/* ------------------------------------------------------------------ */

function isVideo(v: any): v is Video {
  return (
    v &&
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.category === 'string'
  )
}

function normalizeDoc(raw: any): VideoDoc {
  if (Array.isArray(raw)) {
    return { version: DOC_VERSION, updatedAt: '', videos: raw.filter(isVideo) }
  }
  return {
    version: typeof raw?.version === 'number' ? raw.version : DOC_VERSION,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : '',
    videos: Array.isArray(raw?.videos) ? raw.videos.filter(isVideo) : [],
  }
}

export function readCache(): VideoDoc | null {
  try {
    const raw = localStorage.getItem(LS_CACHE)
    return raw ? normalizeDoc(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function writeCache(doc: VideoDoc): void {
  try {
    localStorage.setItem(LS_CACHE, JSON.stringify(doc))
  } catch {
    /* ignore */
  }
}

export function clearCache(): void {
  try {
    localStorage.removeItem(LS_CACHE)
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* GitHub Gist read / write / create                                   */
/* ------------------------------------------------------------------ */

function ghMessage(status: number, action: string): string {
  if (status === 401) return `${action}: token rejected (401). Check the token.`
  if (status === 403) return `${action}: forbidden (403). Token needs the "gist" scope.`
  if (status === 404) return `${action}: not found (404). Check the Gist ID.`
  if (status === 422) return `${action}: rejected (422).`
  return `${action}: failed (${status}).`
}

function ghHeaders(token: string, json = false): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export async function readGistDoc(
  config: GistConfig | null = getGistConfig(),
): Promise<VideoDoc | null> {
  if (!config || !config.gistId) return null
  const res = await fetch(`${GH_API}/gists/${config.gistId}`, {
    headers: ghHeaders(config.token),
  })
  if (!res.ok) throw new Error(ghMessage(res.status, 'Load list'))

  const gist = await res.json()
  const files = gist.files || {}
  const file = files[config.filename] || Object.values<any>(files)[0]
  if (!file) return null

  let content: string = file.content ?? ''
  if (file.truncated && file.raw_url) {
    content = await (await fetch(file.raw_url)).text()
  }
  if (!content) return { version: DOC_VERSION, updatedAt: '', videos: [] }
  return normalizeDoc(JSON.parse(content))
}

export async function writeGistDoc(
  doc: VideoDoc,
  config: GistConfig | null = getGistConfig(),
): Promise<VideoDoc> {
  if (!config || !config.token || !config.gistId) {
    throw new Error('Gist not configured')
  }
  const stamped: VideoDoc = {
    version: DOC_VERSION,
    updatedAt: new Date().toISOString(),
    videos: doc.videos,
  }
  const res = await fetch(`${GH_API}/gists/${config.gistId}`, {
    method: 'PATCH',
    headers: ghHeaders(config.token, true),
    body: JSON.stringify({
      files: { [config.filename]: { content: JSON.stringify(stamped, null, 2) } },
    }),
  })
  if (!res.ok) throw new Error(ghMessage(res.status, 'Save list'))
  writeCache(stamped)
  return stamped
}

export async function createGist(
  doc: VideoDoc,
  token: string,
  filename: string = DEFAULT_FILENAME,
): Promise<string> {
  const stamped: VideoDoc = {
    version: DOC_VERSION,
    updatedAt: new Date().toISOString(),
    videos: doc.videos,
  }
  const res = await fetch(`${GH_API}/gists`, {
    method: 'POST',
    headers: ghHeaders(token, true),
    body: JSON.stringify({
      description: 'KiddieTube video list (shared)',
      public: false,
      files: { [filename]: { content: JSON.stringify(stamped, null, 2) } },
    }),
  })
  if (!res.ok) throw new Error(ghMessage(res.status, 'Create list'))
  const gist = await res.json()
  return gist.id as string
}

/* ------------------------------------------------------------------ */
/* Seed + combined loader                                              */
/* ------------------------------------------------------------------ */

export async function fetchSeed(): Promise<VideoDoc> {
  const base = import.meta.env.BASE_URL || '/'
  const res = await fetch(`${base}videos.json`)
  if (!res.ok) throw new Error(`Seed list failed (${res.status})`)
  return normalizeDoc(await res.json())
}

export async function loadVideos(): Promise<LoadResult> {
  const config = getGistConfig()
  if (config && config.gistId) {
    try {
      const doc = await readGistDoc(config)
      if (doc) {
        writeCache(doc)
        return { doc, source: 'gist' }
      }
    } catch (err) {
      console.warn('[videoStore] gist load failed, falling back', err)
    }
  }

  const cached = readCache()
  if (cached && cached.videos.length) {
    return { doc: cached, source: 'cache' }
  }

  const seed = await fetchSeed()
  return { doc: seed, source: 'seed' }
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export type Op =
  | { type: 'add'; video: Video }
  | { type: 'update'; video: Video }
  | { type: 'delete'; id: string }
  | { type: 'replace'; videos: Video[] }

export function applyOp(list: Video[], op: Op): Video[] {
  switch (op.type) {
    case 'add':
      if (list.some((v) => v.id === op.video.id)) {
        return list.map((v) => (v.id === op.video.id ? { ...v, ...op.video } : v))
      }
      return [...list, op.video]
    case 'update':
      return list.map((v) => (v.id === op.video.id ? { ...v, ...op.video } : v))
    case 'delete':
      return list.filter((v) => v.id !== op.id)
    case 'replace':
      return op.videos
  }
}

/**
 * Apply an edit and persist it.
 *
 * With a Gist configured: re-read the latest remote list, apply the op on top of
 * it (so a concurrent add/edit from another device is preserved), write it back.
 * Without a Gist: apply against `current` and save to the local cache only.
 *
 * Returns the resulting video list.
 */
export async function commitOp(current: Video[], op: Op): Promise<Video[]> {
  const config = getGistConfig()

  if (config && config.gistId) {
    let base = current
    try {
      const remote = await readGistDoc(config)
      if (remote) base = remote.videos
    } catch {
      /* remote unreadable - fall back to current in-memory list */
    }
    const next = applyOp(base, op)
    const saved = await writeGistDoc({ version: DOC_VERSION, updatedAt: '', videos: next }, config)
    return saved.videos
  }

  const next = applyOp(current, op)
  writeCache({ version: DOC_VERSION, updatedAt: new Date().toISOString(), videos: next })
  return next
}
