// Parent console pages for a family's content: videos, categories, kid
// profiles (with pairing this device) and devices.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Category, Device, KidProfile, PairResult, Role, Video } from '@kiddietube/shared'
import { api, authApi } from '../server/api'
import { getPairing, revokeDevice, savePairing, syncFeed } from '../server/device'
import { THEMES } from '../lib/theme'
import { thumbUrl } from '../lib/videoStore'
import { errorText, type Me } from './ParentConsole'
import { navigate, query } from '../router'
import { c, fmtDateTime } from './strings'
import { IMPORT_MAX_LINKS } from '@kiddietube/shared/constants'
import { themeName } from '../lib/i18n'

export interface PageProps {
  familyId: string
  role: Role
  me: Me
}

/**
 * Load/refresh helper with error state, shared by the pages. Switching family
 * clears the old data at once, and a slow answer for the previous family is
 * ignored, so one family's data never shows under another [review L12].
 */
export function useResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const reload = useCallback(async () => {
    const mine = ++seq.current
    try {
      const d = await load()
      if (mine !== seq.current) return
      setData(d)
      setError(null)
    } catch (e) {
      if (mine === seq.current) setError(errorText(e))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => {
    setData(null)
    setError(null)
    void reload()
  }, [reload])
  return { data, error, setError, reload }
}

export function useAction() {
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
        <input className="pp-input" placeholder={c.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="pp-btn pp-btn-primary" onClick={() => setAdding('one')}>
          {c.addVideo}
        </button>
        <button className="pp-btn pp-btn-ghost" onClick={() => setAdding('many')}>
          {c.importLinks}
        </button>
      </div>
      <div className="pp-seg" role="group" aria-label={c.show}>
        {(['all', 'visible', 'hidden'] as const).map((k) => (
          <button key={k} className={`pp-seg-btn ${show === k ? 'active' : ''}`} aria-pressed={show === k} onClick={() => setShow(k)}>
            {k === 'all'
              ? c.showAll(videos.data?.length ?? 0)
              : k === 'visible'
                ? c.showVisible((videos.data?.length ?? 0) - hiddenCount)
                : c.showHidden(hiddenCount)}
          </button>
        ))}
      </div>
      {videos.data && videos.data.length === 0 && (
        <div className="pc-empty">
          <p>{c.noVideos}</p>
          {(cats.data?.length ?? 0) === 0 && <p className="pc-muted">{c.tipCategories}</p>}
        </div>
      )}
      <ul className="pp-list">
        {list.map((v) => {
          const cat = catName(v.categoryId)
          return (
            <li key={v.id} className={`pp-row ${v.hidden ? 'is-hidden' : ''}`}>
              <img className="pp-thumb" src={thumbUrl(v.youtubeId)} alt="" loading="lazy" />
              <div className="pp-row-main">
                <div className="pp-row-title">{v.title}</div>
                <div className="pp-row-cat">
                  {v.hidden && <span className="pp-tag">{c.tagHidden}</span>}
                  {v.status === 'unavailable' && <span className="pp-tag">{c.tagUnavailable}</span>}
                  {cat ? `${cat.emoji} ${cat.name}` : c.noCategory}
                </div>
              </div>
              <div className="pp-row-actions">
                <button className="pp-btn pp-btn-ghost" onClick={() => setEditing(v)} disabled={act.busy}>
                  {c.edit}
                </button>
                <button
                  className="pp-btn pp-btn-ghost"
                  onClick={() => patch(v, { hidden: !v.hidden }, v.hidden ? c.shownAgain : c.hiddenFromKids)}
                  disabled={act.busy}
                >
                  {v.hidden ? c.unhide : c.hide}
                </button>
                <button
                  className="pp-btn pp-btn-danger"
                  disabled={act.busy}
                  onClick={() =>
                    window.confirm(c.confirmDelete(v.title)) &&
                    act.run(async () => {
                      await api.del(`/families/${familyId}/videos/${v.id}`)
                      await videos.reload()
                    }, c.deleted)
                  }
                >
                  {c.delete}
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
      <option value="">{c.noCategory}</option>
      {categories.map((x) => (
        <option key={x.id} value={x.id}>
          {x.emoji} {x.name}
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
      const urls = [...new Set(url.split(/\s+/).filter(Boolean))]
      if (urls.length > IMPORT_MAX_LINKS) return act.setError(c.tooManyLinks(IMPORT_MAX_LINKS))
      await act.run(async () => {
        // each link is looked up on YouTube: allow up to 2 minutes
        const r = await api.post<{ results: { url: string; ok: boolean; error?: string }[] }>(
          `/families/${familyId}/videos/import`,
          { urls, categoryId },
          { timeoutMs: 120_000 },
        )
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
        <h3 className="pp-form-title">{c.importResults}</h3>
        <ul className="pc-results">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? 'ok' : 'fail'}>
              {r.ok ? '✓' : '✗'} {r.url} {r.error && <small>— {r.error}</small>}
            </li>
          ))}
        </ul>
        <button className="pp-btn pp-btn-primary" onClick={() => onClose(true)}>
          {c.done}
        </button>
      </section>
    )

  return (
    <form className="pp-form" onSubmit={submit}>
      <h3 className="pp-form-title">{many ? c.importSeveral : c.addAVideo}</h3>
      <Messages error={act.error} />
      <label className="pp-field">
        <span>{many ? c.linksLabel : c.linkLabel}</span>
        {many ? (
          <textarea className="pp-input" rows={6} value={url} onChange={(e) => setUrl(e.target.value)} required />
        ) : (
          <input className="pp-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required autoFocus />
        )}
      </label>
      {!many && (
        <label className="pp-field">
          <span>
            {c.title} {needTitle ? '' : c.titleOptional}
          </span>
          <input className="pp-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      )}
      <label className="pp-field">
        <span>Category</span>
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
      </label>
      <div className="pp-form-actions">
        <button type="button" className="pp-btn pp-btn-ghost" onClick={() => onClose(false)}>
          {c.cancel}
        </button>
        <button className="pp-btn pp-btn-primary" disabled={act.busy}>
          {act.busy ? (many ? c.importing : c.adding) : many ? c.import : c.add}
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
      <h3 className="pp-form-title">{c.editVideo}</h3>
      <img className="pp-preview" src={thumbUrl(video.youtubeId)} alt="" />
      <Messages error={act.error} />
      <label className="pp-field">
        <span>{c.title}</span>
        <input className="pp-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="pp-field">
        <span>Category</span>
        <CategorySelect categories={categories} value={categoryId} onChange={setCategoryId} />
      </label>
      <div className="pp-form-actions">
        <button type="button" className="pp-btn pp-btn-ghost" onClick={() => onClose(false)}>
          {c.cancel}
        </button>
        <button className="pp-btn pp-btn-primary" disabled={act.busy}>
          {c.save}
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
      }, c.categoryAdded)
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
        <select className="pp-input pc-emoji-select" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label={c.emoji}>
          {EMOJI_CHOICES.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <input className="pp-input" placeholder={c.newCategoryName} value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="pp-btn pp-btn-primary" disabled={act.busy}>
          {c.add}
        </button>
      </form>
      {cats.data?.length === 0 && <p className="pc-muted">{c.noCategories}</p>}
      <ul className="pp-list">
        {(cats.data ?? []).map((cat, i) => (
          <li key={cat.id} className="pp-row">
            <span className="pc-cat-emoji" aria-hidden="true">
              {cat.emoji}
            </span>
            <div className="pp-row-main">
              <div className="pp-row-title">{cat.name}</div>
            </div>
            <div className="pc-row-actions-inline">
              <button className="pp-btn pp-btn-ghost" onClick={() => move(i, -1)} disabled={act.busy || i === 0} aria-label={c.moveUp}>
                ↑
              </button>
              <button
                className="pp-btn pp-btn-ghost"
                onClick={() => move(i, 1)}
                disabled={act.busy || i === (cats.data?.length ?? 0) - 1}
                aria-label={c.moveDown}
              >
                ↓
              </button>
              <button
                className="pp-btn pp-btn-ghost"
                disabled={act.busy}
                onClick={() => {
                  const n = window.prompt(c.renameCategory, cat.name)
                  if (n && n.trim())
                    void act.run(async () => {
                      await api.patch(`/families/${familyId}/categories/${cat.id}`, { name: n.trim() })
                      await cats.reload()
                    })
                }}
              >
                {c.rename}
              </button>
              <button
                className="pp-btn pp-btn-danger"
                disabled={act.busy}
                onClick={async () => {
                  if (!window.confirm(c.confirmDeleteCategory(cat.name))) return
                  let emptied: string[] = []
                  await act.run(async () => {
                    emptied = (await api.del<{ emptiedProfiles: string[] }>(`/families/${familyId}/categories/${cat.id}`)).emptiedProfiles
                    await cats.reload()
                  }, c.deleted)
                  // kids limited to just this category now see nothing [review R3-1]
                  if (emptied.length) window.alert(c.kidsNowEmpty(emptied.join(', ')))
                }}
              >
                {c.delete}
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
  // Opened from "Set up this device" on an unpaired device: walk the parent through it
  const setup = query('setup') !== null && !pairing
  const videos = useResource(() => (setup ? api.get<Video[]>(`/families/${familyId}/videos`) : Promise.resolve(null)), [familyId, setup])

  /**
   * Pair the device in hand. Afterwards the parent is signed out HERE: it's
   * the kid's device now, and a parent session left on it would let the kid
   * into the console past the PIN [review K2]. The device's previous pairing
   * (if any) is revoked so it doesn't stay active on the server [review M5].
   */
  const pairThisDevice = async (p: KidProfile) => {
    const name = window.prompt(c.nameDevicePrompt, c.defaultDeviceName(p.name))
    if (!name) return
    const ok = await act.run(async () => {
      const previous = getPairing()
      const r = await api.post<PairResult>(`/families/${familyId}/devices`, { kidProfileId: p.id, name })
      savePairing({ deviceId: r.device.id, familyId, kidProfileId: p.id, key: r.deviceKey, name })
      if (previous) await revokeDevice(previous)
      await syncFeed()
    })
    if (!ok) return
    await authApi.signOut().catch(() => {})
    window.alert(c.pairedSignedOut(p.name))
    window.location.assign(import.meta.env.BASE_URL)
  }

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
      {setup && profiles.data && (
        <aside className="pc-setup-guide" aria-label={c.setupGuideTitle}>
          <strong>{c.setupGuideTitle}</strong>
          <ol>
            <li className={profiles.data.length > 0 ? 'done' : ''}>{c.setupStepAddKid}</li>
            <li>{c.setupStepUseDevice}</li>
          </ol>
          {videos.data?.length === 0 && (
            <p className="pc-setup-warning">
              {c.setupNoVideos}{' '}
              <button className="pp-btn pp-btn-ghost" onClick={() => navigate('/parent/videos')}>
                {c.setupAddVideos}
              </button>
            </p>
          )}
        </aside>
      )}
      <p className="pc-muted">
        {c.profilesIntro}
      </p>
      <button className="pp-btn pp-btn-primary" onClick={() => setEditing('new')}>
        {c.addKid}
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
                  {p.name} {here && <span className="pp-tag">{c.thisDevice}</span>}
                </div>
                <div className="pp-row-cat">
                  {p.allCategories
                    ? c.allCategories
                    : p.categoryIds.length === 0
                      ? c.noCategoriesKid
                      : (cats.data ?? [])
                        .filter((x) => p.categoryIds.includes(x.id))
                        .map((x) => `${x.emoji} ${x.name}`)
                        .join(', ')}
                </div>
              </div>
              <div className="pp-row-actions">
                <button className="pp-btn pp-btn-primary" onClick={() => pairThisDevice(p)} disabled={act.busy || here}>
                  {c.useThisDevice}
                </button>
                <button className="pp-btn pp-btn-ghost" onClick={() => setEditing(p)}>
                  {c.edit}
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
  const [all, setAll] = useState(profile?.allCategories ?? true)
  const [catIds, setCatIds] = useState<string[]>(profile?.categoryIds ?? [])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const body = { name, avatar, defaultTheme, allCategories: all, categoryIds: all ? [] : catIds }
    const ok = await act.run(() =>
      profile ? api.patch(`/families/${familyId}/profiles/${profile.id}`, body) : api.post(`/families/${familyId}/profiles`, body),
    )
    if (ok) onClose(true)
  }
  return (
    <form className="pp-form" onSubmit={submit}>
      <h3 className="pp-form-title">{profile ? c.editProfile(profile.name) : c.addAKid}</h3>
      <Messages error={act.error} />
      <label className="pp-field">
        <span>{c.name}</span>
        <input className="pp-input" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <div className="pp-field">
        <span>{c.avatar}</span>
        <div className="pc-chip-row">
          {AVATARS.map((a) => (
            <button type="button" key={a} className={`pc-chip ${avatar === a ? 'active' : ''}`} onClick={() => setAvatar(a)}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <label className="pp-field">
        <span>{c.themeOnNew}</span>
        <select className="pp-input" value={defaultTheme ?? ''} onChange={(e) => setDefaultTheme((e.target.value || null) as typeof defaultTheme)}>
          <option value="">{c.defaultTheme}</option>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.emoji} {themeName(t)}
            </option>
          ))}
        </select>
      </label>
      <div className="pp-field">
        <span>{c.kidCategories}</span>
        <label className="pc-check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          {c.allCategoriesToggle}
        </label>
        {!all && catIds.length === 0 && <div className="pp-error">{c.noVideosWarning}</div>}
        <div className="pc-chip-row" hidden={all}>
          {categories.map((cat) => {
            const on = catIds.includes(cat.id)
            return (
              <button
                type="button"
                key={cat.id}
                className={`pc-chip ${on ? 'active' : ''}`}
                aria-pressed={on}
                onClick={() => setCatIds(on ? catIds.filter((x) => x !== cat.id) : [...catIds, cat.id])}
              >
                {cat.emoji} {cat.name}
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
              window.confirm(c.confirmRemoveKid(profile.name)) &&
              act.run(async () => {
                await api.del(`/families/${familyId}/profiles/${profile.id}`)
                onClose(true)
              })
            }
          >
            {c.remove}
          </button>
        )}
        <span className="pc-spacer" />
        <button type="button" className="pp-btn pp-btn-ghost" onClick={() => onClose(false)}>
          {c.cancel}
        </button>
        <button className="pp-btn pp-btn-primary" disabled={act.busy}>
          {c.save}
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
  const fmt = (iso: string | null) => (iso ? fmtDateTime(iso) : c.never)

  return (
    <section>
      <Messages error={devices.error ?? act.error} notice={act.notice} />
      <p className="pc-muted">
        {c.devicesIntro}
      </p>
      <ul className="pp-list">
        {(devices.data ?? []).map((d) => (
          <li key={d.id} className={`pp-row ${d.revoked ? 'is-hidden' : ''}`}>
            <span className="pc-cat-emoji" aria-hidden="true">
              📱
            </span>
            <div className="pp-row-main">
              <div className="pp-row-title">
                {d.name} {pairing?.deviceId === d.id && <span className="pp-tag">{c.thisDevice}</span>}
                {d.revoked && <span className="pp-tag">{c.revoked}</span>}
              </div>
              <div className="pp-row-cat">
                {profiles.data?.find((p) => p.id === d.kidProfileId)?.name ?? '—'} · {c.lastSeen(fmt(d.lastSeenAt))}
              </div>
            </div>
            {!d.revoked && (
              <button
                className="pp-btn pp-btn-danger"
                disabled={act.busy}
                onClick={() =>
                  window.confirm(c.confirmRevoke(d.name)) &&
                  act.run(async () => {
                    await api.post(`/families/${familyId}/devices/${d.id}/revoke`)
                    await devices.reload()
                  }, c.revoked)
                }
              >
                {c.revoke}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
