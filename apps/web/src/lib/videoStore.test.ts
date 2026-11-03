import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Video,
  applyOp,
  applyOps,
  commitOp,
  hasPin,
  parseYouTubeId,
  readCache,
  setGistConfig,
  setPin,
  sortNewestFirst,
  verifyPin,
  visibleVideos,
  writeCache,
} from './videoStore'

const v = (id: string, extra: Partial<Video> = {}): Video => ({ id, title: `T ${id}`, category: 'C', ...extra })
const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'
const C = 'ccccccccccc'

beforeEach(() => localStorage.clear())

describe('parseYouTubeId', () => {
  it.each([
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['  dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('extracts the id from %s', (input, id) => {
    expect(parseYouTubeId(input)).toBe(id)
  })

  it.each(['', 'not a link', 'https://example.com/watch?x=1', 'https://youtu.be/short'])(
    'returns null for %j',
    (input) => {
      expect(parseYouTubeId(input)).toBeNull()
    },
  )
})

describe('applyOp / applyOps', () => {
  const list = [v(A), v(B, { hidden: true })]

  it('adds a new video at the end', () => {
    expect(applyOp(list, { type: 'add', video: v(C) }).map((x) => x.id)).toEqual([A, B, C])
  })

  it('merges an add for an id that already exists instead of duplicating it', () => {
    const next = applyOp(list, { type: 'add', video: v(A, { title: 'new' }) })
    expect(next).toHaveLength(2)
    expect(next[0].title).toBe('new')
  })

  it('updates and deletes by id', () => {
    expect(applyOp(list, { type: 'update', video: v(A, { title: 'x' }) })[0].title).toBe('x')
    expect(applyOp(list, { type: 'delete', id: A }).map((x) => x.id)).toEqual([B])
  })

  it('setHidden only touches the flag, and unhiding removes the key', () => {
    const hidden = applyOp(list, { type: 'setHidden', id: A, hidden: true })
    expect(hidden[0]).toEqual({ ...v(A), hidden: true })
    const shown = applyOp(list, { type: 'setHidden', id: B, hidden: false })
    expect('hidden' in shown[1]).toBe(false)
    expect(shown[1].title).toBe(list[1].title)
  })

  it('replace swaps the whole list', () => {
    expect(applyOp(list, { type: 'replace', videos: [v(C)] }).map((x) => x.id)).toEqual([C])
  })

  it('applies several ops in order (id change = delete + add)', () => {
    const next = applyOps(list, [
      { type: 'delete', id: A },
      { type: 'add', video: v(C) },
    ])
    expect(next.map((x) => x.id)).toEqual([B, C])
  })

  it('does not mutate its input', () => {
    const copy = structuredClone(list)
    applyOps(list, [{ type: 'setHidden', id: A, hidden: true }, { type: 'delete', id: B }])
    expect(list).toEqual(copy)
  })
})

describe('sortNewestFirst / visibleVideos', () => {
  it('puts videos added from the panel first (newest on top), bundled ones after in original order', () => {
    const list = [
      v('seed1______'),
      v('old________', { addedAt: '2026-01-01T00:00:00Z' }),
      v('seed2______'),
      v('new________', { addedAt: '2026-09-01T00:00:00Z' }),
      v('badDate____', { addedAt: 'not a date' }),
    ]
    expect(sortNewestFirst(list).map((x) => x.id)).toEqual([
      'new________',
      'old________',
      'seed1______',
      'seed2______',
      'badDate____',
    ])
  })

  it('filters out hidden videos', () => {
    expect(visibleVideos([v(A), v(B, { hidden: true })]).map((x) => x.id)).toEqual([A])
  })
})

describe('cache normalisation', () => {
  it('drops entries with invalid ids and non-boolean hidden flags', () => {
    localStorage.setItem(
      'kiddietube-videos-cache',
      JSON.stringify({
        version: 2,
        updatedAt: '',
        videos: [
          v(A, { hidden: 'yes' as unknown as boolean }),
          v('../../evil'),
          { id: B, title: 'no category' },
          v(C, { hidden: true }),
        ],
      }),
    )
    const doc = readCache()!
    expect(doc.videos.map((x) => x.id)).toEqual([A, C])
    expect('hidden' in doc.videos[0]).toBe(false)
    expect(doc.videos[1].hidden).toBe(true)
  })

  it('accepts the legacy bare-array format', () => {
    localStorage.setItem('kiddietube-videos-cache', JSON.stringify([v(A)]))
    expect(readCache()!.videos.map((x) => x.id)).toEqual([A])
  })

  it('round-trips through writeCache', () => {
    writeCache({ version: 2, updatedAt: 'now', videos: [v(A)] })
    expect(readCache()!.videos).toEqual([v(A)])
  })
})

describe('commitOp without a Gist (this device only)', () => {
  it('applies against the current list and saves the cache', async () => {
    const next = await commitOp([v(A)], { type: 'add', video: v(B) })
    expect(next.map((x) => x.id)).toEqual([A, B])
    expect(readCache()!.videos.map((x) => x.id)).toEqual([A, B])
  })
})

describe('commitOp with a Gist (regressions for the sync data-loss fixes)', () => {
  const remoteDoc = (videos: Video[]) => ({
    files: { 'kiddietube-videos.json': { content: JSON.stringify({ version: 2, updatedAt: '', videos }) } },
  })

  beforeEach(() => setGistConfig({ token: 't', gistId: 'g1', filename: 'kiddietube-videos.json' }))
  afterEach(() => vi.unstubAllGlobals())

  it('reads the latest remote list with the HTTP cache bypassed, applies the op on top of it, and writes it back', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        if (!init?.method) return new Response(JSON.stringify(remoteDoc([v(A), v(C)])), { status: 200 })
        return new Response('{}', { status: 200 })
      }),
    )

    // local copy is stale (only A); another device already added C
    const next = await commitOp([v(A)], { type: 'add', video: v(B) })

    expect(next.map((x) => x.id)).toEqual([A, C, B]) // C preserved
    expect(calls[0].init?.cache).toBe('no-store') // the 60s GitHub cache bug
    const patch = calls.find((c) => c.init?.method === 'PATCH')!
    const written = JSON.parse(JSON.parse(patch.init!.body as string).files['kiddietube-videos.json'].content)
    expect(written.videos.map((x: Video) => x.id)).toEqual([A, C, B])
  })

  it('fails instead of overwriting the shared list when the remote list cannot be read', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('nope', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(commitOp([v(A)], { type: 'add', video: v(B) })).rejects.toThrow()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })
})

describe('parent PIN', () => {
  it('no PIN set: access allowed', () => {
    expect(hasPin()).toBe(false)
    expect(verifyPin('anything')).toBe(true)
  })

  it('checks the PIN and can be removed', () => {
    setPin('1234')
    expect(hasPin()).toBe(true)
    expect(verifyPin('1234')).toBe(true)
    expect(verifyPin('4321')).toBe(false)
    setPin(null)
    expect(hasPin()).toBe(false)
  })
})
