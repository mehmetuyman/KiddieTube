// Parent console (server mode): sign-in, family selection and the
// management pages. Kids never see this; the kids' page opens it via the
// logo long-press (PIN-gated on paired devices).
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Family } from '@kiddietube/shared'
import { ApiRequestError, api, authApi } from '../server/api'
import { here, navigate, nextPath, query, usePath } from '../router'
import { CategoriesPage, DevicesPage, ProfilesPage, VideosPage } from './FamilyPages'
import { AdminPage, MembersPage, SettingsPage } from './SettingsPages'
import './console.css'
import GetStarted from './GetStarted'
import { c } from './strings'
import { getLang, setLang, type Lang } from '../lib/i18n'
import { signOutWhenConsoleCloses } from '../server/device'

export interface Me {
  user: { id: string; email: string; name: string; isAdmin: boolean }
  families: Family[]
}

const LS_FAMILY = 'kt-family'

export function errorText(e: unknown): string {
  if (e instanceof ApiRequestError) return e.message
  return (e as Error)?.message ?? String(e)
}

/* ------------------------------------------------------------------ */

export default function ParentConsole() {
  const path = usePath()
  const [me, setMe] = useState<Me | null | undefined>(undefined) // undefined = loading
  const [offline, setOffline] = useState(false)

  const loadMe = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/me'))
      setOffline(false)
    } catch (e) {
      if (e instanceof ApiRequestError && e.offline) setOffline(true)
      setMe(null)
    }
  }, [])

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  // on a kid's device the parent session ends with the visit [review R2-1, R2-7]
  useEffect(() => signOutWhenConsoleCloses(), [])

  // Landing pages from email links work signed-out too
  if (path.startsWith('/reset-password')) return <Shell><ResetPassword onDone={loadMe} /></Shell>
  if (path.startsWith('/join')) return <Shell><Join me={me} onDone={loadMe} /></Shell>
  if (path.startsWith('/accept')) return <Shell><AcceptInvite me={me} onDone={loadMe} /></Shell>

  if (me === undefined) return <Shell><p className="pc-muted">{c.loading}</p></Shell>
  if (offline && !me) return <Shell><OfflineNotice /></Shell>
  if (!me) return <Shell><SignIn onDone={loadMe} /></Shell>

  return <SignedIn me={me} path={path} reloadMe={loadMe} />
}

function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="pc-page">
      <div className={`pc-card ${wide ? 'pc-wide' : ''}`}>
        <div className="pc-header">
          <div className="pc-brand" onClick={() => navigate('/')} role="link">
            <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="" className="pc-logo" />
            <span>Kiddie Tube</span>
          </div>
          <LanguageSelect />
        </div>
        {children}
      </div>
    </div>
  )
}

/** This device's language (kids' page, console, emails); reloads to apply. */
export function LanguageSelect() {
  return (
    <select
      className="pc-lang"
      aria-label={c.language}
      value={getLang()}
      onChange={(e) => {
        setLang(e.target.value as Lang)
        window.location.reload()
      }}
    >
      <option value="tr">🇹🇷 Türkçe</option>
      <option value="en">🇬🇧 English</option>
    </select>
  )
}

export function OfflineNotice() {
  return (
    <div className="pp-error">
      {c.offline}
    </div>
  )
}

/* ---------------------------- signed in ---------------------------- */

const PAGES = [
  { path: '/parent/videos', label: c.nav.videos, icon: '🎬' },
  { path: '/parent/categories', label: c.nav.categories, icon: '🗂️' },
  { path: '/parent/profiles', label: c.nav.kids, icon: '🧒' },
  { path: '/parent/devices', label: c.nav.devices, icon: '📱' },
  { path: '/parent/members', label: c.nav.parents, icon: '👪' },
  { path: '/parent/settings', label: c.nav.settings, icon: '⚙️' },
]

function SignedIn({ me, path, reloadMe }: { me: Me; path: string; reloadMe: () => Promise<void> }) {
  const [familyId, setFamilyIdState] = useState<string | null>(() => {
    const saved = localStorage.getItem(LS_FAMILY)
    return me.families.find((f) => f.id === saved)?.id ?? me.families[0]?.id ?? null
  })
  const setFamilyId = (id: string) => {
    localStorage.setItem(LS_FAMILY, id)
    setFamilyIdState(id)
  }
  const family = me.families.find((f) => f.id === familyId) ?? null

  if (path.startsWith('/parent/admin') && me.user.isAdmin) {
    return (
      <Shell wide>
        <TopBar me={me} family={family} setFamilyId={setFamilyId} />
        <AdminPage />
      </Shell>
    )
  }

  if (!family) {
    return (
      <Shell>
        <TopBar me={me} family={null} setFamilyId={setFamilyId} />
        {me.user.isAdmin ? (
          <CreateFamily onCreated={async (f) => (await reloadMe(), setFamilyId(f.id))} />
        ) : (
          <p className="pc-muted">{c.noFamily}</p>
        )}
      </Shell>
    )
  }

  const page = PAGES.find((p) => path.startsWith(p.path)) ?? PAGES[0]
  const props = { familyId: family.id, role: family.role, me }
  return (
    <Shell wide>
      <TopBar me={me} family={family} setFamilyId={setFamilyId} />
      <GetStarted familyId={family.id} path={path} />
      <nav className="pc-nav">
        {PAGES.map((p) => (
          <button key={p.path} className={`pc-nav-btn ${p === page ? 'active' : ''}`} onClick={() => navigate(p.path)}>
            <span aria-hidden="true">{p.icon}</span> {p.label}
          </button>
        ))}
      </nav>
      <main className="pc-main">
        {page.path === '/parent/videos' && <VideosPage {...props} />}
        {page.path === '/parent/categories' && <CategoriesPage {...props} />}
        {page.path === '/parent/profiles' && <ProfilesPage {...props} />}
        {page.path === '/parent/devices' && <DevicesPage {...props} />}
        {page.path === '/parent/members' && <MembersPage {...props} />}
        {page.path === '/parent/settings' && <SettingsPage {...props} family={family} reloadMe={reloadMe} />}
      </main>
    </Shell>
  )
}

function TopBar({ me, family, setFamilyId }: { me: Me; family: Family | null; setFamilyId: (id: string) => void }) {
  const signOut = async () => {
    await authApi.signOut().catch(() => {})
    window.location.reload()
  }
  return (
    <div className="pc-topbar">
      {me.families.length > 1 ? (
        <select className="pp-input pc-family-select" value={family?.id ?? ''} onChange={(e) => setFamilyId(e.target.value)}>
          {me.families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      ) : (
        <strong>{family?.name ?? ''}</strong>
      )}
      <span className="pc-spacer" />
      <button className="pp-btn pp-btn-ghost" onClick={() => navigate('/')}>
        {c.kidsView}
      </button>
      {me.user.isAdmin && (
        <button className="pp-btn pp-btn-ghost" onClick={() => navigate('/parent/admin')}>
          {c.admin}
        </button>
      )}
      <button className="pp-btn pp-btn-ghost" onClick={signOut} title={me.user.email}>
        {c.signOut}
      </button>
    </div>
  )
}

function CreateFamily({ onCreated, inviteToken }: { onCreated: (f: Family) => void; inviteToken?: string }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.post<Family>('/families', { name, inviteToken }))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="pp-form">
      <h3 className="pp-form-title">{c.createFamilyTitle}</h3>
      <p className="pc-muted">{c.createFamilyText}</p>
      {error && <div className="pp-error">{error}</div>}
      <label className="pp-field">
        <span>{c.familyName}</span>
        <input className="pp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={c.familyNamePh} required />
      </label>
      <button className="pp-btn pp-btn-primary" disabled={busy || !name.trim()}>
        {busy ? c.creating : c.createFamily}
      </button>
    </form>
  )
}

/* ------------------------------ auth ------------------------------- */

function SignIn({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await authApi.signIn(email, password)
      await onDone()
      // back to the invitation (etc.) that sent them here [review M3]
      navigate(nextPath('/parent/videos'), { replace: true })
    } catch (err) {
      setError(err instanceof ApiRequestError && err.status === 401 ? c.wrongLogin : errorText(err))
    } finally {
      setBusy(false)
    }
  }
  const forgot = async () => {
    if (!email) return setError(c.enterEmailFirst)
    setError(null)
    try {
      await authApi.requestReset(email)
      setNotice(c.resetSent)
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <form onSubmit={submit} className="pp-form">
      <h3 className="pp-form-title">{c.signInTitle}</h3>
      {error && <div className="pp-error">{error}</div>}
      {notice && <div className="pp-notice">{notice}</div>}
      <label className="pp-field">
        <span>{c.email}</span>
        <input className="pp-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="pp-field">
        <span>{c.password}</span>
        <input
          className="pp-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <div className="pp-form-actions">
        <button type="button" className="pp-btn pp-btn-ghost" onClick={forgot}>
          {c.forgot}
        </button>
        <button className="pp-btn pp-btn-primary" disabled={busy}>
          {busy ? c.signingIn : c.signIn}
        </button>
      </div>
      <p className="pc-muted">{c.inviteOnly}</p>
    </form>
  )
}

/**
 * Start an account: name and email only. The password is chosen from the
 * link in the email (so only the owner of the address can set it), which
 * then brings them back to this page [review R2-4].
 */
function SignUpForm({ email: presetEmail, title }: { email?: string; title: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState(presetEmail ?? '')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await authApi.signUp(email, name, here())
      setSentTo(email)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  if (sentTo)
    return (
      <div className="pp-form">
        <h3 className="pp-form-title">{c.checkEmailTitle}</h3>
        <div className="pp-notice">{c.checkEmailText(sentTo)}</div>
      </div>
    )
  return (
    <form onSubmit={submit} className="pp-form">
      <h3 className="pp-form-title">{title}</h3>
      {error && <div className="pp-error">{error}</div>}
      <label className="pp-field">
        <span>{c.yourName}</span>
        <input className="pp-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="pp-field">
        <span>{c.inviteEmail}</span>
        <input className="pp-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <button className="pp-btn pp-btn-primary" disabled={busy}>
        {busy ? c.creatingAccount : c.createAccount}
      </button>
      <p className="pc-muted">
        {c.haveAccount[0]}
        <a href="#" onClick={(e) => (e.preventDefault(), navigate(`/parent?next=${encodeURIComponent(here())}`))}>
          {c.haveAccount[1]}
        </a>
        {c.haveAccount[2]}
      </p>
    </form>
  )
}

/** /join?invite=…  — create an account (if needed) and a new family. */
function Join({ me, onDone }: { me: Me | null | undefined; onDone: () => Promise<void> }) {
  const token = query('invite') ?? ''
  // No invite token and signed in: nothing to join, go to the console
  // (in an effect, not during render [review L9]).
  const done = !token && !!me
  useEffect(() => {
    if (done) navigate('/parent', { replace: true })
  }, [done])
  if (me === undefined) return <p className="pc-muted">{c.loading}</p>
  // No invite token: first-time sign-up of the instance admin (the server only
  // accepts admin emails or invited ones), then on to create a family.
  if (!token) return me ? null : <SignUpForm title={c.createYourAccount} />
  if (!me) return <SignUpForm title={c.welcomeCreate} />
  return <CreateFamily inviteToken={token} onCreated={async () => (await onDone(), navigate('/parent/profiles', { replace: true }))} />
}

/** /accept?invitation=…  — join an existing family as a parent. */
function AcceptInvite({ me, onDone }: { me: Me | null | undefined; onDone: () => Promise<void> }) {
  const id = query('invitation') ?? ''
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!id) return <div className="pp-error">{c.inviteIncomplete}</div>
  if (me === undefined) return <p className="pc-muted">{c.loading}</p>
  if (!me) return <SignUpForm title={c.invitedCreate} />
  const accept = async () => {
    setBusy(true)
    try {
      const fam = await api.post<Family>(`/invitations/${id}/accept`)
      localStorage.setItem(LS_FAMILY, fam.id)
      await onDone()
      navigate('/parent/videos', { replace: true })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="pp-form">
      <h3 className="pp-form-title">{c.joinFamily}</h3>
      {error && <div className="pp-error">{error}</div>}
      <p className="pc-muted">{c.signedInAs(me.user.email)}</p>
      <button className="pp-btn pp-btn-primary" onClick={accept} disabled={busy}>
        {busy ? c.joining : c.acceptInvitation}
      </button>
    </div>
  )
}

/**
 * /reset-password?token=…[&next=…] — choose a password from the email link
 * (a reset, or finishing a new account), then sign in and go on to `next`.
 */
function ResetPassword({ onDone }: { onDone: () => Promise<void> }) {
  const token = query('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(query('error') ? c.resetInvalid : null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return setError(c.passwordsDontMatch)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(errorText(err))
    }
  }
  if (done)
    return (
      <>
        <div className="pp-notice">{c.passwordChanged}</div>
        <SignIn onDone={onDone} />
      </>
    )
  return (
    <form onSubmit={submit} className="pp-form">
      <h3 className="pp-form-title">{c.newPasswordTitle}</h3>
      {error && <div className="pp-error">{error}</div>}
      <label className="pp-field">
        <span>{c.newPasswordLabel}</span>
        <input className="pp-input" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <label className="pp-field">
        <span>{c.confirmPasswordLabel}</span>
        <input className="pp-input" type="password" autoComplete="new-password" minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </label>
      <button className="pp-btn pp-btn-primary" disabled={!token}>
        {c.savePassword}
      </button>
    </form>
  )
}
