import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Video,
  Op,
  commitOp,
  parseYouTubeId,
  fetchYouTubeMeta,
  thumbUrl,
  getGistConfig,
  setGistConfig,
  isGistConfigured,
  readGistDoc,
  createGist,
  fetchSeed,
  clearCache,
  hasPin,
  setPin,
  verifyPin,
} from '../lib/videoStore'

type Props = {
  open: boolean
  onClose: () => void
  videos: Video[]
  onVideosChange: (videos: Video[]) => void
  onRefresh: () => Promise<void> | void
}

const NEW_CATEGORY = '__new__'

type FormState = {
  mode: 'add' | 'edit'
  original: Video | null
  url: string
  videoId: string
  title: string
  channel: string
  category: string
  newCategory: string
  titleTouched: boolean
}

function emptyForm(firstCategory: string): FormState {
  return {
    mode: 'add',
    original: null,
    url: '',
    videoId: '',
    title: '',
    channel: '',
    category: firstCategory || NEW_CATEGORY,
    newCategory: '',
    titleTouched: false,
  }
}

export default function ParentPanel({
  open,
  onClose,
  videos,
  onVideosChange,
  onRefresh,
}: Props) {
  const [tab, setTab] = useState<'videos' | 'sync'>('videos')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const categories = useMemo(
    () => Array.from(new Set(videos.map((v) => v.category))).sort((a, b) => a.localeCompare(b)),
    [videos],
  )

  const [form, setForm] = useState<FormState | null>(null)
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const metaReqRef = useRef(0)
  const lastMetaIdRef = useRef<string>('')

  // Sync-tab local inputs
  const existing = getGistConfig()
  const [token, setToken] = useState(existing?.token ?? '')
  const [gistId, setGistId] = useState(existing?.gistId ?? '')
  const [pinInput, setPinInput] = useState('')

  useEffect(() => {
    if (!open) {
      setForm(null)
      setError(null)
      setNotice(null)
      setTab('videos')
      setFilter('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (form) setForm(null)
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, form, onClose])

  if (!open) return null

  /* ---------------------------------------------------------------- */

  async function runOp(op: Op, successMsg: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const next = await commitOp(videos, op)
      onVideosChange(next)
      setNotice(isGistConfigured() ? `${successMsg} — synced to all devices` : `${successMsg} on this device`)
      return true
    } catch (err: any) {
      setError(err?.message || String(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  function openAddForm() {
    lastMetaIdRef.current = ''
    setForm(emptyForm(categories[0] ?? NEW_CATEGORY))
    setError(null)
    setNotice(null)
  }

  function openEditForm(v: Video) {
    lastMetaIdRef.current = v.id // don't auto-refetch the title we already have
    setForm({
      mode: 'edit',
      original: v,
      url: v.id,
      videoId: v.id,
      title: v.title,
      channel: v.channel ?? '',
      category: v.category,
      newCategory: '',
      titleTouched: true,
    })
    setError(null)
    setNotice(null)
  }

  async function autofillFromUrl(raw: string) {
    const id = parseYouTubeId(raw)
    setForm((f) => (f ? { ...f, url: raw, videoId: id ?? '' } : f))
    if (!id) {
      lastMetaIdRef.current = ''
      return
    }
    if (id === lastMetaIdRef.current) return // same video - already fetched
    lastMetaIdRef.current = id
    const reqId = ++metaReqRef.current
    setFetchingMeta(true)
    const meta = await fetchYouTubeMeta(id)
    if (reqId !== metaReqRef.current) return
    setFetchingMeta(false)
    if (!meta) return
    setForm((f) => {
      if (!f) return f
      return {
        ...f,
        channel: meta.channel || f.channel,
        title: f.titleTouched && f.title ? f.title : meta.title || f.title,
      }
    })
  }

  async function saveForm() {
    if (!form) return
    const id = form.videoId || parseYouTubeId(form.url)
    if (!id) {
      setError('Enter a valid YouTube link or 11-character video ID.')
      return
    }
    const title = form.title.trim()
    if (!title) {
      setError('Title is required.')
      return
    }
    const category =
      form.category === NEW_CATEGORY ? form.newCategory.trim() : form.category.trim()
    if (!category) {
      setError('Pick a category or type a new one.')
      return
    }

    const duplicate = videos.find((v) => v.id === id)
    if (form.mode === 'add' && duplicate) {
      setError(`That video is already in the list ("${duplicate.title}").`)
      return
    }

    const video: Video = {
      id,
      title,
      category,
      channel: form.channel.trim() || undefined,
      addedAt: form.original?.addedAt ?? new Date().toISOString(),
    }

    let op: Op
    if (form.mode === 'edit' && form.original && form.original.id !== id) {
      // id changed on edit -> remove old entry, add new
      await runOp({ type: 'delete', id: form.original.id }, 'Removed old entry')
      op = { type: 'add', video }
    } else {
      op = form.mode === 'add' ? { type: 'add', video } : { type: 'update', video }
    }

    const ok = await runOp(op, form.mode === 'add' ? 'Added' : 'Saved')
    if (ok) setForm(null)
  }

  async function deleteVideo(v: Video) {
    if (!window.confirm(`Remove "${v.title}" from the list?`)) return
    await runOp({ type: 'delete', id: v.id }, 'Removed')
  }

  /* ---- sync tab actions ---- */

  async function connectExisting() {
    if (!token.trim() || !gistId.trim()) {
      setError('Enter both a token and a Gist ID.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const cfg = { token: token.trim(), gistId: gistId.trim(), filename: 'kiddietube-videos.json' }
      const doc = await readGistDoc(cfg)
      setGistConfig(cfg)
      if (!doc || doc.videos.length === 0) {
        // push the current list into the empty/new gist file
        await commitOp(videos, { type: 'replace', videos })
      }
      await onRefresh()
      setNotice('Connected. This device now shares the cloud list.')
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function createShared() {
    if (!token.trim()) {
      setError('Enter a GitHub token first.')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const id = await createGist(
        { version: 2, updatedAt: '', videos },
        token.trim(),
        'kiddietube-videos.json',
      )
      setGistConfig({ token: token.trim(), gistId: id, filename: 'kiddietube-videos.json' })
      setGistId(id)
      await onRefresh()
      setNotice('Shared list created. Connect other devices with this same token + Gist ID.')
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  function disconnect(removeToken: boolean) {
    if (removeToken) {
      setGistConfig(null)
      setToken('')
    } else {
      const cfg = getGistConfig()
      if (cfg) setGistConfig({ ...cfg, gistId: '' })
      setGistId('')
    }
    setNotice('Disconnected on this device. The cloud list is unchanged.')
  }

  async function resetToBundled() {
    if (!window.confirm('Replace the whole list with the original bundled videos? This cannot be undone.')) {
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const seed = await fetchSeed()
      if (!isGistConfigured()) clearCache()
      const next = await commitOp(videos, { type: 'replace', videos: seed.videos })
      onVideosChange(next)
      setNotice('List reset to the bundled videos.')
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  function savePin() {
    const p = pinInput.trim()
    if (p && !/^\d{4,8}$/.test(p)) {
      setError('PIN must be 4–8 digits (or leave blank to remove).')
      return
    }
    setPin(p || null)
    setPinInput('')
    setNotice(p ? 'Parent PIN set.' : 'Parent PIN removed.')
  }

  /* ---------------------------------------------------------------- */

  const filtered = filter.trim()
    ? videos.filter(
        (v) =>
          v.title.toLowerCase().includes(filter.toLowerCase()) ||
          v.category.toLowerCase().includes(filter.toLowerCase()),
      )
    : videos

  const connected = isGistConfigured()

  return (
    <div className="pp-overlay" role="dialog" aria-modal="true" aria-label="Parent panel">
      <div className="pp-sheet">
        <header className="pp-header">
          <span className="pp-title">Parent panel</span>
          <button className="pp-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="pp-tabs">
          <button
            className={`pp-tab ${tab === 'videos' ? 'active' : ''}`}
            onClick={() => setTab('videos')}
          >
            Videos ({videos.length})
          </button>
          <button
            className={`pp-tab ${tab === 'sync' ? 'active' : ''}`}
            onClick={() => setTab('sync')}
          >
            Sync {connected ? '✓' : ''}
          </button>
        </div>

        <div className="pp-body">
          {error && <div className="pp-error">{error}</div>}
          {notice && <div className="pp-notice">{notice}</div>}

          {tab === 'videos' && !form && (
            <>
              <div className="pp-toolbar">
                <input
                  className="pp-input"
                  placeholder="Filter…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <button className="pp-btn pp-btn-primary" onClick={openAddForm} disabled={busy}>
                  + Add video
                </button>
              </div>

              <ul className="pp-list">
                {filtered.map((v) => (
                  <li className="pp-row" key={v.id}>
                    <img className="pp-thumb" src={thumbUrl(v.id)} alt="" loading="lazy" />
                    <div className="pp-row-main">
                      <div className="pp-row-title">{v.title}</div>
                      <div className="pp-row-cat">{v.category}</div>
                    </div>
                    <div className="pp-row-actions">
                      <button className="pp-btn pp-btn-ghost" onClick={() => openEditForm(v)} disabled={busy}>
                        Edit
                      </button>
                      <button className="pp-btn pp-btn-danger" onClick={() => deleteVideo(v)} disabled={busy}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
                {filtered.length === 0 && <li className="pp-empty">No videos match.</li>}
              </ul>
            </>
          )}

          {tab === 'videos' && form && (
            <div className="pp-form">
              <h3 className="pp-form-title">{form.mode === 'add' ? 'Add a video' : 'Edit video'}</h3>

              <label className="pp-field">
                <span>YouTube link or video ID</span>
                <input
                  className="pp-input"
                  value={form.url}
                  placeholder="https://www.youtube.com/watch?v=…"
                  onChange={(e) => autofillFromUrl(e.target.value)}
                  autoFocus
                />
                <small className="pp-hint">
                  {fetchingMeta
                    ? 'Fetching title…'
                    : form.videoId
                      ? `Video ID: ${form.videoId}`
                      : 'Paste a link — the title fills in automatically.'}
                </small>
              </label>

              {form.videoId && (
                <img className="pp-preview" src={thumbUrl(form.videoId)} alt="" />
              )}

              <label className="pp-field">
                <span>Title</span>
                <input
                  className="pp-input"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, title: e.target.value, titleTouched: true } : f))
                  }
                />
              </label>

              <label className="pp-field">
                <span>Category</span>
                <select
                  className="pp-input"
                  value={form.category}
                  onChange={(e) => setForm((f) => (f ? { ...f, category: e.target.value } : f))}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY}>➕ New category…</option>
                </select>
              </label>

              {form.category === NEW_CATEGORY && (
                <label className="pp-field">
                  <span>New category name</span>
                  <input
                    className="pp-input"
                    value={form.newCategory}
                    placeholder="e.g. Doğa / Nature"
                    onChange={(e) => setForm((f) => (f ? { ...f, newCategory: e.target.value } : f))}
                  />
                </label>
              )}

              <div className="pp-form-actions">
                <button className="pp-btn pp-btn-ghost" onClick={() => setForm(null)} disabled={busy}>
                  Cancel
                </button>
                <button className="pp-btn pp-btn-primary" onClick={saveForm} disabled={busy}>
                  {busy ? 'Saving…' : form.mode === 'add' ? 'Add' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {tab === 'sync' && (
            <div className="pp-sync">
              <p className="pp-sync-status">
                {connected
                  ? `Connected — edits sync across every device using this Gist.`
                  : `Not connected — edits stay on this device only.`}
              </p>

              <label className="pp-field">
                <span>GitHub personal access token</span>
                <input
                  className="pp-input"
                  type="password"
                  value={token}
                  placeholder="ghp_… (scope: gist only)"
                  onChange={(e) => setToken(e.target.value)}
                />
                <small className="pp-hint">
                  Create at github.com/settings/tokens with the <b>gist</b> scope only. Stored on this
                  device.
                </small>
              </label>

              <label className="pp-field">
                <span>Gist ID</span>
                <input
                  className="pp-input"
                  value={gistId}
                  placeholder="leave blank and press “Create shared list”"
                  onChange={(e) => setGistId(e.target.value)}
                />
              </label>

              <div className="pp-form-actions pp-wrap">
                <button className="pp-btn pp-btn-primary" onClick={connectExisting} disabled={busy}>
                  Connect to Gist
                </button>
                <button className="pp-btn pp-btn-ghost" onClick={createShared} disabled={busy}>
                  Create shared list
                </button>
                {connected && (
                  <button className="pp-btn pp-btn-ghost" onClick={() => onRefresh()} disabled={busy}>
                    Refresh from cloud
                  </button>
                )}
              </div>

              {connected && (
                <div className="pp-form-actions pp-wrap">
                  <button className="pp-btn pp-btn-ghost" onClick={() => disconnect(false)} disabled={busy}>
                    Disconnect (keep token)
                  </button>
                  <button className="pp-btn pp-btn-danger" onClick={() => disconnect(true)} disabled={busy}>
                    Remove token from device
                  </button>
                </div>
              )}

              <hr className="pp-hr" />

              <label className="pp-field">
                <span>Parent PIN (optional)</span>
                <input
                  className="pp-input"
                  inputMode="numeric"
                  value={pinInput}
                  placeholder={hasPin() ? 'enter new PIN, or blank to remove' : '4–8 digits'}
                  onChange={(e) => setPinInput(e.target.value)}
                />
                <small className="pp-hint">
                  {hasPin()
                    ? 'A PIN is set. This panel asks for it before opening.'
                    : 'Set a PIN so the panel asks before it opens.'}
                </small>
              </label>
              <div className="pp-form-actions">
                <button className="pp-btn pp-btn-ghost" onClick={savePin} disabled={busy}>
                  {pinInput.trim() ? 'Save PIN' : hasPin() ? 'Remove PIN' : 'Save PIN'}
                </button>
              </div>

              <hr className="pp-hr" />

              <button className="pp-btn pp-btn-danger" onClick={resetToBundled} disabled={busy}>
                Reset list to bundled videos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function requestParentAccess(): boolean {
  if (!hasPin()) return true
  const entry = window.prompt('Parent PIN')
  if (entry == null) return false
  if (!verifyPin(entry)) {
    window.alert('Wrong PIN')
    return false
  }
  return true
}
