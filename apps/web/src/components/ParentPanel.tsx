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
  LoadSource,
} from '../lib/videoStore'
import { THEMES, DEFAULT_THEME, ThemeId, getTheme, setTheme } from '../lib/theme'
import { getLang, setLang, t, themeName } from '../lib/i18n'
import { p } from './parentPanelStrings'
import PasswordInput from './PasswordInput'

type Props = {
  open: boolean
  onClose: () => void
  videos: Video[]
  onVideosChange: (videos: Video[]) => void
  onRefresh: () => Promise<LoadSource>
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
  const [tab, setTab] = useState<'videos' | 'sync' | 'theme'>('videos')
  const [themeId, setThemeId] = useState<ThemeId>(() => getTheme())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [show, setShow] = useState<'all' | 'visible' | 'hidden'>('all')

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
      setShow('all')
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

  async function runOp(op: Op | Op[], successMsg: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const next = await commitOp(videos, op)
      onVideosChange(next)
      setNotice(isGistConfigured() ? p.synced(successMsg) : p.onDevice(successMsg))
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
    if (id && id === lastMetaIdRef.current) return // same video - already fetched
    // Any change of id (including to "no id") invalidates an in-flight lookup,
    // so a slow response can't fill in the title of a video no longer entered.
    const reqId = ++metaReqRef.current
    if (!id) {
      lastMetaIdRef.current = ''
      setFetchingMeta(false)
      return
    }
    lastMetaIdRef.current = id
    setFetchingMeta(true)
    const meta = await fetchYouTubeMeta(id)
    if (reqId !== metaReqRef.current) return
    setFetchingMeta(false)
    if (!meta) return
    setForm((f) => {
      if (!f || f.videoId !== id) return f
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
      setError(p.badLink)
      return
    }
    const title = form.title.trim()
    if (!title) {
      setError(p.titleRequired)
      return
    }
    const category =
      form.category === NEW_CATEGORY ? form.newCategory.trim() : form.category.trim()
    if (!category) {
      setError(p.pickCategory)
      return
    }

    const idChanged = form.mode === 'add' || form.original?.id !== id
    const duplicate = idChanged ? videos.find((v) => v.id === id) : undefined
    if (duplicate) {
      setError(p.duplicate(duplicate.title, !!duplicate.hidden))
      return
    }

    const video: Video = {
      id,
      title,
      category,
      channel: form.channel.trim() || undefined,
      addedAt: form.original?.addedAt ?? new Date().toISOString(),
      // keep a hidden video hidden when its link is changed (delete + add)
      ...(form.original?.hidden ? { hidden: true } : {}),
    }

    let op: Op | Op[]
    if (form.mode === 'edit' && form.original && form.original.id !== id) {
      // id changed on edit -> replace the old entry in one atomic commit
      op = [
        { type: 'delete', id: form.original.id },
        { type: 'add', video },
      ]
    } else {
      op = form.mode === 'add' ? { type: 'add', video } : { type: 'update', video }
    }

    const ok = await runOp(op, form.mode === 'add' ? p.added : p.saved)
    if (ok) setForm(null)
  }

  async function toggleHidden(v: Video) {
    const hide = !v.hidden
    await runOp({ type: 'setHidden', id: v.id, hidden: hide }, hide ? p.hiddenNotice : p.shownAgain)
  }

  async function deleteVideo(v: Video) {
    if (!window.confirm(p.confirmRemove(v.title))) return
    await runOp({ type: 'delete', id: v.id }, p.removed)
  }

  /* ---- sync tab actions ---- */

  async function connectExisting() {
    if (!token.trim() || !gistId.trim()) {
      setError(p.needTokenAndGist)
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
      setNotice(p.connected)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function createShared() {
    if (!token.trim()) {
      setError(p.needToken)
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
      setNotice(p.sharedCreated)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function refreshFromCloud() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const source = await onRefresh()
      if (source === 'gist') setNotice(p.refreshed)
      else setError(p.cloudUnreachable)
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
    setNotice(p.disconnected)
  }

  async function resetToBundled() {
    if (!window.confirm(p.confirmReset)) {
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
      setNotice(p.resetDone)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  function savePin() {
    const pin = pinInput.trim()
    if (pin && !/^\d{4,8}$/.test(pin)) {
      setError(p.pinInvalid)
      return
    }
    setPin(pin || null)
    setPinInput('')
    setNotice(pin ? p.pinSet : p.pinRemoved)
  }

  /* ---------------------------------------------------------------- */

  const q = filter.trim().toLowerCase()
  const hiddenCount = videos.filter((v) => v.hidden).length
  const filtered = videos.filter(
    (v) =>
      (show === 'all' || (show === 'hidden') === !!v.hidden) &&
      (!q || v.title.toLowerCase().includes(q) || v.category.toLowerCase().includes(q)),
  )

  const connected = isGistConfigured()

  return (
    <div className="pp-overlay" role="dialog" aria-modal="true" aria-label={p.panel}>
      <div className="pp-sheet">
        <header className="pp-header">
          <span className="pp-title">{p.panel}</span>
          <button className="pp-x" onClick={onClose} aria-label={p.close}>
            ✕
          </button>
        </header>

        <div className="pp-tabs">
          <button
            className={`pp-tab ${tab === 'videos' ? 'active' : ''}`}
            onClick={() => setTab('videos')}
          >
            {p.tabVideos(videos.length)}
          </button>
          <button
            className={`pp-tab ${tab === 'sync' ? 'active' : ''}`}
            onClick={() => setTab('sync')}
          >
            {p.tabSync} {connected ? '✓' : ''}
          </button>
          <button
            className={`pp-tab ${tab === 'theme' ? 'active' : ''}`}
            onClick={() => setTab('theme')}
          >
            {p.tabTheme}
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
                  placeholder={p.filter}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                <button className="pp-btn pp-btn-primary" onClick={openAddForm} disabled={busy}>
                  {p.addVideo}
                </button>
              </div>

              <div className="pp-seg" role="group" aria-label={p.show}>
                {(['all', 'visible', 'hidden'] as const).map((k) => (
                  <button
                    key={k}
                    className={`pp-seg-btn ${show === k ? 'active' : ''}`}
                    onClick={() => setShow(k)}
                    aria-pressed={show === k}
                  >
                    {k === 'all'
                      ? p.showAll(videos.length)
                      : k === 'visible'
                        ? p.showVisible(videos.length - hiddenCount)
                        : p.showHidden(hiddenCount)}
                  </button>
                ))}
              </div>

              <ul className="pp-list">
                {filtered.map((v) => (
                  <li className={`pp-row ${v.hidden ? 'is-hidden' : ''}`} key={v.id}>
                    <img className="pp-thumb" src={thumbUrl(v.id)} alt="" loading="lazy" />
                    <div className="pp-row-main">
                      <div className="pp-row-title">{v.title}</div>
                      <div className="pp-row-cat">
                        {v.hidden && <span className="pp-tag">{p.tagHidden}</span>}
                        {v.category}
                      </div>
                    </div>
                    <div className="pp-row-actions">
                      <button className="pp-btn pp-btn-ghost" onClick={() => openEditForm(v)} disabled={busy}>
                        {p.edit}
                      </button>
                      <button
                        className="pp-btn pp-btn-ghost"
                        onClick={() => toggleHidden(v)}
                        disabled={busy}
                        title={v.hidden ? p.showTitle : p.hideTitle}
                      >
                        {v.hidden ? p.unhide : p.hide}
                      </button>
                      <button className="pp-btn pp-btn-danger" onClick={() => deleteVideo(v)} disabled={busy}>
                        {p.delete}
                      </button>
                    </div>
                  </li>
                ))}
                {filtered.length === 0 && <li className="pp-empty">{p.noMatch}</li>}
              </ul>
            </>
          )}

          {tab === 'videos' && form && (
            <div className="pp-form">
              <h3 className="pp-form-title">{form.mode === 'add' ? p.addAVideo : p.editVideo}</h3>

              <label className="pp-field">
                <span>{p.linkLabel}</span>
                <input
                  className="pp-input"
                  value={form.url}
                  placeholder="https://www.youtube.com/watch?v=…"
                  onChange={(e) => autofillFromUrl(e.target.value)}
                  autoFocus
                />
                <small className="pp-hint">
                  {fetchingMeta
                    ? p.fetchingTitle
                    : form.videoId
                      ? p.videoId(form.videoId)
                      : p.pasteHint}
                </small>
              </label>

              {form.videoId && (
                <img className="pp-preview" src={thumbUrl(form.videoId)} alt="" />
              )}

              <label className="pp-field">
                <span>{p.title}</span>
                <input
                  className="pp-input"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, title: e.target.value, titleTouched: true } : f))
                  }
                />
              </label>

              <label className="pp-field">
                <span>{p.category}</span>
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
                  <option value={NEW_CATEGORY}>{p.newCategoryOption}</option>
                </select>
              </label>

              {form.category === NEW_CATEGORY && (
                <label className="pp-field">
                  <span>{p.newCategoryName}</span>
                  <input
                    className="pp-input"
                    value={form.newCategory}
                    placeholder={p.newCategoryPh}
                    onChange={(e) => setForm((f) => (f ? { ...f, newCategory: e.target.value } : f))}
                  />
                </label>
              )}

              <div className="pp-form-actions">
                <button className="pp-btn pp-btn-ghost" onClick={() => setForm(null)} disabled={busy}>
                  {p.cancel}
                </button>
                <button className="pp-btn pp-btn-primary" onClick={saveForm} disabled={busy}>
                  {busy ? p.saving : form.mode === 'add' ? p.add : p.save}
                </button>
              </div>
            </div>
          )}

          {tab === 'theme' && (
            <div className="pp-themes">
              <p className="pp-sync-status">
                {p.themeIntro[0]}
                <b>{p.themeIntro[1]}</b>
                {p.themeIntro[2]}
              </p>
              <div className="pp-theme-grid">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={`pp-theme-card ${themeId === t.id ? 'active' : ''}`}
                    aria-pressed={themeId === t.id}
                    onClick={() => {
                      setTheme(t.id)
                      setThemeId(t.id)
                    }}
                  >
                    <span className="pp-theme-preview" style={{ background: t.preview.bg }} aria-hidden="true">
                      <span className="pp-theme-preview-header" style={{ background: t.preview.header }} />
                      <span className="pp-theme-preview-pills">
                        <span style={{ background: t.preview.pillActive }} />
                        <span style={{ background: t.preview.pill }} />
                        <span style={{ background: t.preview.pill }} />
                      </span>
                      <span className="pp-theme-preview-play" style={{ background: t.preview.play }} />
                    </span>
                    <span className="pp-theme-label">
                      <span>
                        {t.emoji} {themeName(t)}
                      </span>
                      {t.id === DEFAULT_THEME && <span className="pp-tag">{p.defaultTag}</span>}
                      {themeId === t.id && <span className="pp-theme-check">✓</span>}
                    </span>
                  </button>
                ))}
              </div>
              <p className="pp-sync-status">{p.language}</p>
              <div className="pp-form-actions pp-wrap">
                {(
                  [
                    ['tr', '🇹🇷 Türkçe'],
                    ['en', '🇬🇧 English'],
                  ] as const
                ).map(([code, label]) => (
                  <button
                    key={code}
                    className={`pp-btn ${getLang() === code ? 'pp-btn-primary' : 'pp-btn-ghost'}`}
                    aria-pressed={getLang() === code}
                    onClick={() => {
                      setLang(code)
                      window.location.reload()
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === 'sync' && (
            <div className="pp-sync">
              <p className="pp-sync-status">
                {connected
                  ? p.syncConnected
                  : p.syncNotConnected}
              </p>

              <label className="pp-field">
                <span>{p.tokenLabel}</span>
                <PasswordInput
                  className="pp-input"
                  value={token}
                  placeholder={p.tokenPh}
                  onChange={(e) => setToken(e.target.value)}
                />
                <small className="pp-hint">
                  {p.tokenHint[0]}
                  <b>{p.tokenHint[1]}</b>
                  {p.tokenHint[2]}
                </small>
              </label>

              <label className="pp-field">
                <span>Gist ID</span>
                <input
                  className="pp-input"
                  value={gistId}
                  placeholder={p.gistPh}
                  onChange={(e) => setGistId(e.target.value)}
                />
              </label>

              <div className="pp-form-actions pp-wrap">
                <button className="pp-btn pp-btn-primary" onClick={connectExisting} disabled={busy}>
                  {p.connect}
                </button>
                <button className="pp-btn pp-btn-ghost" onClick={createShared} disabled={busy}>
                  {p.createShared}
                </button>
                {connected && (
                  <button className="pp-btn pp-btn-ghost" onClick={refreshFromCloud} disabled={busy}>
                    {p.refresh}
                  </button>
                )}
              </div>

              {connected && (
                <div className="pp-form-actions pp-wrap">
                  <button className="pp-btn pp-btn-ghost" onClick={() => disconnect(false)} disabled={busy}>
                    {p.disconnectKeep}
                  </button>
                  <button className="pp-btn pp-btn-danger" onClick={() => disconnect(true)} disabled={busy}>
                    {p.removeToken}
                  </button>
                </div>
              )}

              <hr className="pp-hr" />

              <label className="pp-field">
                <span>{p.pinLabel}</span>
                <input
                  className="pp-input"
                  inputMode="numeric"
                  value={pinInput}
                  placeholder={hasPin() ? p.pinNewPh : p.pinDigitsPh}
                  onChange={(e) => setPinInput(e.target.value)}
                />
                <small className="pp-hint">
                  {hasPin()
                    ? p.pinIsSet
                    : p.pinNotSet}
                </small>
              </label>
              <div className="pp-form-actions">
                <button className="pp-btn pp-btn-ghost" onClick={savePin} disabled={busy}>
                  {pinInput.trim() ? p.savePin : hasPin() ? p.removePin : p.savePin}
                </button>
              </div>

              <hr className="pp-hr" />

              <button className="pp-btn pp-btn-danger" onClick={resetToBundled} disabled={busy}>
                {p.resetList}
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
  const entry = window.prompt(t.parentPin)
  if (entry == null) return false
  if (!verifyPin(entry)) {
    window.alert(t.wrongPin)
    return false
  }
  return true
}
