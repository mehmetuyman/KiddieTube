// Parent console (server mode): sign-in, family selection and the
// management pages. Kids never see this; the kids' page opens it via the
// logo long-press (PIN-gated on paired devices).
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Family } from '@kiddietube/shared'
import { ApiRequestError, api, authApi } from '../server/api'
import { navigate, query, usePath } from '../router'
import { CategoriesPage, DevicesPage, ProfilesPage, VideosPage } from './FamilyPages'
import { AdminPage, MembersPage, SettingsPage } from './SettingsPages'
import './console.css'

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

  // Landing pages from email links work signed-out too
  if (path.startsWith('/reset-password')) return <Shell><ResetPassword /></Shell>
  if (path.startsWith('/join')) return <Shell><Join me={me} onDone={loadMe} /></Shell>
  if (path.startsWith('/accept')) return <Shell><AcceptInvite me={me} onDone={loadMe} /></Shell>

  if (me === undefined) return <Shell><p className="pc-muted">Loading…</p></Shell>
  if (offline && !me) return <Shell><OfflineNotice /></Shell>
  if (!me) return <Shell><SignIn onDone={loadMe} /></Shell>

  return <SignedIn me={me} path={path} reloadMe={loadMe} />
}

function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="pc-page">
      <div className={`pc-card ${wide ? 'pc-wide' : ''}`}>
        <div className="pc-brand" onClick={() => navigate('/')} role="link">
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="" className="pc-logo" />
          <span>Kiddie Tube</span>
        </div>
        {children}
      </div>
    </div>
  )
}

export function OfflineNotice() {
  return (
    <div className="pp-error">
      The Kiddie Tube server can’t be reached right now, so changes are paused. Videos keep playing on the kids’ devices. Try again later.
    </div>
  )
}

/* ---------------------------- signed in ---------------------------- */

const PAGES = [
  { path: '/parent/videos', label: 'Videos', icon: '🎬' },
  { path: '/parent/categories', label: 'Categories', icon: '🗂️' },
  { path: '/parent/profiles', label: 'Kids', icon: '🧒' },
  { path: '/parent/devices', label: 'Devices', icon: '📱' },
  { path: '/parent/members', label: 'Parents', icon: '👪' },
  { path: '/parent/settings', label: 'Settings', icon: '⚙️' },
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
          <p className="pc-muted">You’re not part of a family yet. Ask the person who invited you for a new invitation link.</p>
        )}
      </Shell>
    )
  }

  const page = PAGES.find((p) => path.startsWith(p.path)) ?? PAGES[0]
  const props = { familyId: family.id, role: family.role, me }
  return (
    <Shell wide>
      <TopBar me={me} family={family} setFamilyId={setFamilyId} />
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
        ← Kids’ view
      </button>
      {me.user.isAdmin && (
        <button className="pp-btn pp-btn-ghost" onClick={() => navigate('/parent/admin')}>
          Admin
        </button>
      )}
      <button className="pp-btn pp-btn-ghost" onClick={signOut} title={me.user.email}>
        Sign out
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
      <h3 className="pp-form-title">Create your family</h3>
      <p className="pc-muted">It starts empty and private: only parents you invite can see or change it.</p>
      {error && <div className="pp-error">{error}</div>}
      <label className="pp-field">
        <span>Family name</span>
        <input className="pp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Yılmaz family" required />
      </label>
      <button className="pp-btn pp-btn-primary" disabled={busy || !name.trim()}>
        {busy ? 'Creating…' : 'Create family'}
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
      if (!window.location.pathname.includes('/parent')) navigate('/parent/videos', { replace: true })
    } catch (err) {
      setError(err instanceof ApiRequestError && err.status === 401 ? 'Wrong email or password.' : errorText(err))
    } finally {
      setBusy(false)
    }
  }
  const forgot = async () => {
    if (!email) return setError('Enter your email first.')
    setError(null)
    try {
      await authApi.requestReset(email)
      setNotice('If that email has an account, a reset link is on its way.')
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <form onSubmit={submit} className="pp-form">
      <h3 className="pp-form-title">Parent sign-in</h3>
      {error && <div className="pp-error">{error}</div>}
      {notice && <div className="pp-notice">{notice}</div>}
      <label className="pp-field">
        <span>Email</span>
        <input className="pp-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="pp-field">
        <span>Password</span>
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
          Forgot password?
        </button>
        <button className="pp-btn pp-btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </div>
      <p className="pc-muted">Kiddie Tube is invite-only. New here? Use the link in your invitation email.</p>
    </form>
  )
}

function SignUpForm({ email: presetEmail, onDone, title }: { email?: string; onDone: () => Promise<void>; title: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState(presetEmail ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await authApi.signUp(email, password, name)
      await onDone()
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.status === 400 && /email/i.test(err.message) === false
          ? 'This email can’t register. Use the exact address the invitation was sent to.'
          : errorText(err),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="pp-form">
      <h3 className="pp-form-title">{title}</h3>
      {error && <div className="pp-error">{error}</div>}
      <label className="pp-field">
        <span>Your name</span>
        <input className="pp-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="pp-field">
        <span>Email (the one the invitation was sent to)</span>
        <input className="pp-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="pp-field">
        <span>Password (at least 10 characters)</span>
        <input
          className="pp-input"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <button className="pp-btn pp-btn-primary" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
      <p className="pc-muted">
        Already have an account?{' '}
        <a href="#" onClick={(e) => (e.preventDefault(), navigate('/parent'))}>
          Sign in
        </a>{' '}
        and open the link again.
      </p>
    </form>
  )
}

/** /join?invite=…  — create an account (if needed) and a new family. */
function Join({ me, onDone }: { me: Me | null | undefined; onDone: () => Promise<void> }) {
  const token = query('invite') ?? ''
  if (me === undefined) return <p className="pc-muted">Loading…</p>
  // No invite token: first-time sign-up of the instance admin (the server only
  // accepts admin emails or invited ones), then on to create a family.
  if (!token) {
    if (!me) return <SignUpForm title="Create your account" onDone={async () => (await onDone(), navigate('/parent', { replace: true }))} />
    navigate('/parent', { replace: true })
    return null
  }
  if (!me) return <SignUpForm title="Welcome! Create your parent account" onDone={onDone} />
  return <CreateFamily inviteToken={token} onCreated={async () => (await onDone(), navigate('/parent/profiles', { replace: true }))} />
}

/** /accept?invitation=…  — join an existing family as a parent. */
function AcceptInvite({ me, onDone }: { me: Me | null | undefined; onDone: () => Promise<void> }) {
  const id = query('invitation') ?? ''
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!id) return <div className="pp-error">This invitation link is incomplete.</div>
  if (me === undefined) return <p className="pc-muted">Loading…</p>
  if (!me) return <SignUpForm title="You’re invited! Create your parent account" onDone={onDone} />
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
      <h3 className="pp-form-title">Join this family</h3>
      {error && <div className="pp-error">{error}</div>}
      <p className="pc-muted">Signed in as {me.user.email}.</p>
      <button className="pp-btn pp-btn-primary" onClick={accept} disabled={busy}>
        {busy ? 'Joining…' : 'Accept invitation'}
      </button>
    </div>
  )
}

/** /reset-password?token=…  — choose a new password from the email link. */
function ResetPassword() {
  const token = query('token') ?? ''
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(query('error') ? 'This reset link is invalid or has expired.' : null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(errorText(err))
    }
  }
  if (done)
    return (
      <div className="pp-form">
        <div className="pp-notice">Password changed. You can sign in now.</div>
        <button className="pp-btn pp-btn-primary" onClick={() => navigate('/parent', { replace: true })}>
          Sign in
        </button>
      </div>
    )
  return (
    <form onSubmit={submit} className="pp-form">
      <h3 className="pp-form-title">Choose a new password</h3>
      {error && <div className="pp-error">{error}</div>}
      <label className="pp-field">
        <span>New password (at least 10 characters)</span>
        <input className="pp-input" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <button className="pp-btn pp-btn-primary" disabled={!token}>
        Save password
      </button>
    </form>
  )
}
