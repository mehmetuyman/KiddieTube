// Parent console pages for a family's content: videos, categories, kid
// profiles (with pairing this device) and devices.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Category, Device, KidProfile, PairResult, Role, Video } from '@kiddietube/shared'
import { api } from '../server/api'
import { getPairing, savePairing, syncFeed } from '../server/device'
import { THEMES } from '../lib/theme'
import { thumbUrl } from '../lib/videoStore'
import { errorText, type Me } from './ParentConsole'

export interface PageProps {
  familyId: string
  role: Role
  me: Me
}

/** Load/refresh helper with error + busy state shared by the pages. */
function useResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setData(await load())
      setError(null)
    } catch (e) {
      setError(errorText(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, error, setError, reload }
}

function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      if (done) setNotice(done)
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, notice, run, setError }
}

function Messages({ error, notice }: { error?: string | null; notice?: string | null }) {
  return (
    <>
      {error && <div className="pp-error">{error}</div>}
      {notice && <div className="pp-notice">{notice}</div>}
    </>
  )
}

/* ------------------------------ videos ------------------------------ */

export function VideosPage({ familyId }: PageProps) {
  const videos = useResource(() => api.get<Video[]>(`/families/${familyId}/videos`), [familyId])
  const cats = useResource(() => api.get<Category[]>(`/families/${familyId}/categories`), [familyId])
  const act = useAction()
  const [filter, setFilter] = useState('')
  const [show, setShow] = useState<'all' | 'visible' | 'hidden'>('all')
  const [adding, setAdding] = useState<'one' | 'many' | null>(null)
  const [editing, setEditing] = useState<Video | null>(null)

  const catName = (id: string | null) => cats.data?.find((c) => c.id === id)
  const list = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (videos.data ?? []).filter(
      (v) =>
        (show === 'all' || (show === 'hidden') === v.hidden) &&
        (!q || v.title.toLowerCase().includes(q) || (catName(v.categoryId)?.name.toLowerCase().includes(q) ?? false)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videos.data, cats.data, filter, show])
  const hiddenCount = (videos.data ?? []).filter((v) => v.hidden).length

  const patch = (v: Video, body: Partial<Video>, done: string) =>
    act.run(async () => {
      await api.patch(`/families/${familyId}/videos/${v.id}`, body)
      await videos.reload()
    }, done)

  if (adding)
    return (
      <AddVideos
        familyId={familyId}
        categories={cats.data ?? []}
        many={adding === 'many'}
        onClose={async (changed) => {
          setAdding(null)
          if (changed) await videos.reload()
        }}
      />
    )
  if (editing)
    return (
      <EditVideo
        familyId={familyId}
        video={editing}
        categories={cats.data ?? []}
        onClose={async (changed) => {
          setEditing(null)
          if (changed) await videos.reload()
        }}
      />
    )

  return (
    <section>
      <Messages error={videos.error ?? act.error} notice={act.notice} />
      <div className="pp-toolbar">
        <input className="pp-input" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="pp-btn pp-btn-primary" onClick={() => setAdding('one')}>
          + Add video
        </button>
        <button className="pp-btn pp-btn-ghost" onClick={() => setAdding('many')}>
          Import links
        </button>
      </div>
      <div className="pp-seg" role="group" aria-label="Show">
        {(['all', 'visible', 'hidden'] as const).map((k) => (
          <button key={k} className={`pp-seg-btn ${show === k ? 'active' : ''}`} aria-pressed={show === k} onClick={() => setShow(k)}>
            {k === 'all'
              ? `All (${videos.data?.length ?? 0})`
              : k === 'visible'
                ? `Visible (${(videos.data?.length ?? 0) - hiddenCount})`
                : `Hidden (${hiddenCount})`}
          </button>
        ))}
      </div>
      {videos.data && videos.data.length === 0 && (
        <div className="pc-empty">
          <p>No videos yet. Add the first one with a YouTube link.</p>
          {(cats.data?.length ?? 0) === 0 && <p className="pc-muted">Tip: create a few categories first (Categories tab) to group them.</p>}
        </div>
      )}
      <ul className="pp-list">
        {list.map((v) => {
          const c = catName(v.categoryId)
          return (
            <li key={v.id} className={`pp-row ${v.hidden ? 'is-hidden' : ''}`}>
              <img className="pp-thumb" src={thumbUrl(v.youtubeId)} alt="" loading="lazy" />
              <div className="pp-row-main">
                <div className="pp-row-title">{v.title}</div>
                <div className="pp-row-cat">
                  {v.hidden && <span className="pp-tag">Hidden</span>}
                  {v.status === 'unavailable' && <span className="pp-tag">Unavailable</span>}
                  {c ? `${c.emoji} ${c.name}` : 'No category'}
                </div>
              </div>
              <div className="pp-row-actions">
                <button className="pp-btn pp-btn-ghost" onClick={() => setEditing(v)} disabled={act.busy}>
                  Edit
                </button>
                <button
                  className="pp-btn pp-btn-ghost"
                  onClick={() => patch(v, { hidden: !v.hidden }, v.hidden ? 'Shown again' : 'Hidden from the kids')}
                  disabled={act.busy}
                >
                  {v.hidden ? 'Unhide' : 'Hide'}
                </button>
                <button
                  className="pp-btn pp-btn-danger"
                  disabled={act.busy}
                  onClick={() =>
                    window.confirm(`Delete “${v.title}”?`) &&
                    act.run(async () => {
                      await api.del(`/families/${familyId}/videos/${v.id}`)
                      await videos.reload()
                    }, 'Deleted')
                  }
                >
                  Delete
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CategorySelect({ categories, value, onChange }: { categories: Category[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <select className="pp-input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">No category</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.emoji} {c.name}
        </option>
      ))}
    </select>
  )
}

function AddVideos({
  familyId,
  categories,
  many,
  onClose,
}: {
  familyId: string
  categories: Category[]
  many: boolean
  onClose: (changed: boolean) => void
}) {
  const act = useAction()
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryIdState] = useState<string | null>(categories[0]?.id ?? null)
  const [categoryTouched, setCategoryTouched] = useState(false)
  const setCategoryId = (v: string | null) => {
    setCategoryTouched(true)
    setCategoryIdState(v)
  }
  // The form can open before the category list has loaded: default to the
  // first category once it arrives, unless the parent already chose.
  useEffect(() => {
    if (!categoryTouched && categoryId === null && categories.length) setCategoryIdState(categories[0].id)
  }, [categories, categoryId, categoryTouched])
  const [results, setResults] = useState<{ url: string; ok: boolean; error?: string }[] | null>(null)
  const [needTitle, setNeedTitle] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (many) {
      const urls = url.split(/\s+/).filter(Boolean)
      await act.run(async () => {
        const r = await api.post<{ results: { url: string; ok: boolean; error?: string }[] }>(`/families/${familyId}/videos/import`, {
          urls,
          categoryId,
        })
        setResults(r.results)
      })
      return
    }
    const ok = await act.run(() => api.post(`/families/${familyId}/videos`, { url, title: title || undefined, categoryId }))
    if (ok) onClose(true)
    else setNeedTitle(true) // e.g. lookup failed: allow a typed title
  }

  if (results)
    return (
      <section className="pp-form">
        <h3 className="pp-form-title">Import results</h3>
        <ul className="pc-results">
          {results.map((r) => (
            <li key={r.url} className={r.ok ? 'ok' : 'fail'}>
              {r.ok ? '✓' : '✗'} {r.url} {r.error && <small>— {r.error}</small>}
            </li>
          ))}
        </ul>
        <button className="pp-btn pp-btn-primary" onClick={() => onClose(true)}>
          Done
        </button>
      </section>
    )

  return (
    <form className="pp-form" onSubmit={submit}>
      <h3 className="pp-form-title">{many ? 'Import several links' : 'Add a video'}</h3>
      <Messages error={act.error} />
      <label className="pp-field">
        <span>{many ? 'YouTube links (one per line)' : 'YouTube link or video ID'}</span>
        {many ? (
          <textarea className="pp-input" rows={6} value={url} onChange={(e) => setUrl(e.target.value)} required />
        ) : (
          <input className="pp-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required autoFocus />
        )}
      </label>
      {!many && (
        <label className="pp-field">
          <span>Title {needTitle ? '' : '(optional: filled in from YouTube)'}</span>
          <input className="pp-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      )}
      <label className="pp-field">
        <span>Category</span>
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
      </label>
      <div className="pp-form-actions">
        <button type="button" className="pp-btn pp-btn-ghost" onClick={() => onClose(false)}>
          Cancel
        </button>
        <button className="pp-btn pp-btn-primary" disabled={act.busy}>
          {act.busy ? 'Adding…' : many ? 'Import' : 'Add'}
        </button>
      </div>
    </form>
  )
}

function EditVideo({
  familyId,
  video,
  categories,
  onClose,
}: {
  familyId: string
  video: Video
  categories: Category[]
  onClose: (changed: boolean) => void
}) {
  const act = useAction()
  const [title, setTitle] = useState(video.title)
  const [categoryId, setCategoryId] = useState(video.categoryId)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await act.run(() => api.patch(`/families/${familyId}/videos/${video.id}`, { title, categoryId }))) onClose(true)
  }
  return (
    <form className="pp-form" onSubmit={submit}>
      <h3 className="pp-form-title">Edit video</h3>
      <img className="pp-preview" src={thumbUrl(video.youtubeId)} alt="" />
      <Messages error={act.error} />
      <label className="pp-field">
        <span>Title</span>
        <input className="pp-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="pp-field">
        <span>Category</span>
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
      </label>
      <div className="pp-form-actions">
        <button type="button" className="pp-btn pp-btn-ghost" onClick={() => onClose(false)}>
          Cancel
        </button>
        <button className="pp-btn pp-btn-primary" disabled={act.busy}>
          Save
        </button>
      </div>
    </form>
  )
}

/* ---------------------------- categories ---------------------------- */

const EMOJI_CHOICES = ['🎵', '🎬', '🎓', '🕌', '🌱', '💧', '🍴', '💊', '🔬', '🧮', '📚', '🐾', '🚗', '⚽', '🎨', '🌍', '🧸', '🚀']

export function CategoriesPage({ familyId }: PageProps) {
  const cats = useResource(() => api.get<Category[]>(`/families/${familyId}/categories`), [familyId])
  const act = useAction()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (
      await act.run(async () => {
        await api.post(`/families/${familyId}/categories`, { name, emoji })
        await cats.reload()
      }, 'Category added')
    )
      setName('')
  }
  const move = (i: number, d: -1 | 1) => {
    const list = [...(cats.data ?? [])]
    const j = i + d
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    void act.run(async () => {
      await api.post(`/families/${familyId}/categories/reorder`, { ids: list.map((c) => c.id) })
      await cats.reload()
    })
  }

  return (
    <section>
      <Messages error={cats.error ?? act.error} notice={act.notice} />
      <form className="pc-inline-form" onSubmit={add}>
        <select className="pp-input pc-emoji-select" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji">
          {EMOJI_CHOICES.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <input className="pp-input" placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="pp-btn pp-btn-primary" disabled={act.busy}>
          Add
        </button>
      </form>
      {cats.data?.length === 0 && <p className="pc-muted">No categories yet. Kids see a single list until you add some.</p>}
      <ul className="pp-list">
        {(cats.data ?? []).map((c, i) => (
          <li key={c.id} className="pp-row">
            <span className="pc-cat-emoji" aria-hidden="true">
              {c.emoji}
            </span>
            <div className="pp-row-main">
              <div className="pp-row-title">{c.name}</div>
            </div>
            <div className="pc-row-actions-inline">
              <button className="pp-btn pp-btn-ghost" onClick={() => move(i, -1)} disabled={act.busy || i === 0} aria-label="Move up">
                ↑
              </button>
              <button
                className="pp-btn pp-btn-ghost"
                onClick={() => move(i, 1)}
                disabled={act.busy || i === (cats.data?.length ?? 0) - 1}
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                className="pp-btn pp-btn-ghost"
                disabled={act.busy}
                onClick={() => {
                  const n = window.prompt('Rename category', c.name)
                  if (n && n.trim())
                    void act.run(async () => {
                      await api.patch(`/families/${familyId}/categories/${c.id}`, { name: n.trim() })
                      await cats.reload()
                    })
                }}
              >
                Rename
              </button>
              <button
                className="pp-btn pp-btn-danger"
                disabled={act.busy}
                onClick={() =>
                  window.confirm(`Delete “${c.name}”? Its videos stay, without a category.`) &&
                  act.run(async () => {
                    await api.del(`/families/${familyId}/categories/${c.id}`)
                    await cats.reload()
                  }, 'Deleted')
                }
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* -------------------------- kid profiles --------------------------- */

const AVATARS = ['🦁', '🐼', '🐯', '🦊', '🐻', '🐰', '🐸', '🦄', '🐙', '🐢', '🐝', '🦋']

export function ProfilesPage({ familyId }: PageProps) {
  const profiles = useResource(() => api.get<KidProfile[]>(`/families/${familyId}/profiles`), [familyId])
  const cats = useResource(() => api.get<Category[]>(`/families/${familyId}/categories`), [familyId])
  const act = useAction()
  const [editing, setEditing] = useState<KidProfile | 'new' | null>(null)
  const pairing = getPairing()

  const pairThisDevice = (p: KidProfile) =>
    act.run(async () => {
      const name = window.prompt('Name this device (e.g. “Ali’s tablet”)', `${p.name}’s device`)
      if (!name) return
      const r = await api.post<PairResult>(`/families/${familyId}/devices`, { kidProfileId: p.id, name })
      savePairing({ deviceId: r.device.id, familyId, kidProfileId: p.id, key: r.deviceKey, name })
      await syncFeed()
    }, `This device now shows ${p.name}’s videos. It keeps working even when the server is offline.`)

  if (editing)
    return (
      <EditProfile
        familyId={familyId}
        profile={editing === 'new' ? null : editing}
        categories={cats.data ?? []}
        onClose={async (changed) => {
          setEditing(null)
          if (changed) await profiles.reload()
        }}
      />
    )

  return (
    <section>
      <Messages error={profiles.error ?? act.error} notice={act.notice} />
      <p className="pc-muted">
        Each kid profile has its own list (all categories, or just the ones you pick). Pair the phone or tablet you’re holding with a profile using
        “Use this device”.
      </p>
      <button className="pp-btn pp-btn-primary" onClick={() => setEditing('new')}>
        + Add kid
      </button>
      <ul className="pp-list">
        {(profiles.data ?? []).map((p) => {
          const here = pairing?.familyId === familyId && pairing.kidProfileId === p.id
          return (
            <li key={p.id} className="pp-row">
              <span className="pc-cat-emoji" aria-hidden="true">
                {p.avatar ?? '🧒'}
              </span>
              <div className="pp-row-main">
                <div className="pp-row-title">
                  {p.name} {here && <span className="pp-tag">This device</span>}
                </div>
                <div className="pp-row-cat">
                  {p.categoryIds.length === 0
                    ? 'All categories'
                    : (cats.data ?? [])
                        .filter((c) => p.categoryIds.includes(c.id))
                        .map((c) => `${c.emoji} ${c.name}`)
                        .join(', ')}
                </div>
              </div>
              <div className="pp-row-actions">
                <button className="pp-btn pp-btn-primary" onClick={() => pairThisDevice(p)} disabled={act.busy || here}>
                  Use this device
                </button>
                <button className="pp-btn pp-btn-ghost" onClick={() => setEditing(p)}>
                  Edit
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function EditProfile({
  familyId,
  profile,
  categories,
  onClose,
}: {
  familyId: string
  profile: KidProfile | null
  categories: Category[]
  onClose: (changed: boolean) => void
}) {
  const act = useAction()
  const [name, setName] = useState(profile?.name ?? '')
  const [avatar, setAvatar] = useState(profile?.avatar ?? AVATARS[0])
  const [defaultTheme, setDefaultTheme] = useState(profile?.defaultTheme ?? null)
  const [catIds, setCatIds] = useState<string[]>(profile?.categoryIds ?? [])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const body = { name, avatar, defaultTheme, categoryIds: catIds }
    const ok = await act.run(() =>
      profile ? api.patch(`/families/${familyId}/profiles/${profile.id}`, body) : api.post(`/families/${familyId}/profiles`, body),
    )
    if (ok) onClose(true)
  }
  return (
    <form className="pp-form" onSubmit={submit}>
      <h3 className="pp-form-title">{profile ? `Edit ${profile.name}` : 'Add a kid'}</h3>
      <Messages error={act.error} />
      <label className="pp-field">
        <span>Name</span>
        <input className="pp-input" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <div className="pp-field">
        <span>Avatar</span>
        <div className="pc-chip-row">
          {AVATARS.map((a) => (
            <button type="button" key={a} className={`pc-chip ${avatar === a ? 'active' : ''}`} onClick={() => setAvatar(a)}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <label className="pp-field">
        <span>Theme on new devices</span>
        <select className="pp-input" value={defaultTheme ?? ''} onChange={(e) => setDefaultTheme((e.target.value || null) as typeof defaultTheme)}>
          <option value="">Default (Sunny)</option>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji} {t.name} / {t.en}
            </option>
          ))}
        </select>
      </label>
      <div className="pp-field">
        <span>Categories this kid sees (none selected = all)</span>
        <div className="pc-chip-row">
          {categories.map((c) => {
            const on = catIds.includes(c.id)
            return (
              <button
                type="button"
                key={c.id}
                className={`pc-chip ${on ? 'active' : ''}`}
                aria-pressed={on}
                onClick={() => setCatIds(on ? catIds.filter((x) => x !== c.id) : [...catIds, c.id])}
              >
                {c.emoji} {c.name}
              </button>
            )
          })}
        </div>
      </div>
      <div className="pp-form-actions">
        {profile && (
          <button
            type="button"
            className="pp-btn pp-btn-danger"
            onClick={() =>
              window.confirm(`Remove ${profile.name}? Devices paired to this profile stop working.`) &&
              act.run(async () => {
                await api.del(`/families/${familyId}/profiles/${profile.id}`)
                onClose(true)
              })
            }
          >
            Remove
          </button>
        )}
        <span className="pc-spacer" />
        <button type="button" className="pp-btn pp-btn-ghost" onClick={() => onClose(false)}>
          Cancel
        </button>
        <button className="pp-btn pp-btn-primary" disabled={act.busy}>
          Save
        </button>
      </div>
    </form>
  )
}

/* ------------------------------ devices ----------------------------- */

export function DevicesPage({ familyId }: PageProps) {
  const devices = useResource(() => api.get<Device[]>(`/families/${familyId}/devices`), [familyId])
  const profiles = useResource(() => api.get<KidProfile[]>(`/families/${familyId}/profiles`), [familyId])
  const act = useAction()
  const pairing = getPairing()
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'never')

  return (
    <section>
      <Messages error={devices.error ?? act.error} notice={act.notice} />
      <p className="pc-muted">
        To add a device, open Kiddie Tube on it, sign in here and choose “Use this device” on the Kids tab. Lost a device? Revoke it: it stops
        receiving the list.
      </p>
      <ul className="pp-list">
        {(devices.data ?? []).map((d) => (
          <li key={d.id} className={`pp-row ${d.revoked ? 'is-hidden' : ''}`}>
            <span className="pc-cat-emoji" aria-hidden="true">
              📱
            </span>
            <div className="pp-row-main">
              <div className="pp-row-title">
                {d.name} {pairing?.deviceId === d.id && <span className="pp-tag">This device</span>}
                {d.revoked && <span className="pp-tag">Revoked</span>}
              </div>
              <div className="pp-row-cat">
                {profiles.data?.find((p) => p.id === d.kidProfileId)?.name ?? '—'} · last seen {fmt(d.lastSeenAt)}
              </div>
            </div>
            {!d.revoked && (
              <button
                className="pp-btn pp-btn-danger"
                disabled={act.busy}
                onClick={() =>
                  window.confirm(`Revoke “${d.name}”?`) &&
                  act.run(async () => {
                    await api.post(`/families/${familyId}/devices/${d.id}/revoke`)
                    await devices.reload()
                  }, 'Revoked')
                }
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
