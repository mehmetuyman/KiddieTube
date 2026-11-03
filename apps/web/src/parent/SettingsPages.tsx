// Parent console: members, family settings and instance admin.
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Family } from '@kiddietube/shared'
import { api, request } from '../server/api'
import { clearPairing, getPairing } from '../server/device'
import { THEMES, getTheme, setTheme, type ThemeId } from '../lib/theme'
import { errorText } from './ParentConsole'
import type { PageProps } from './FamilyPages'

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
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
  return { data, error, reload }
}

function useMsg() {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
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
  return { error, notice, busy, run }
}

/* ------------------------------ members ----------------------------- */

interface MembersResponse {
  members: { id: string; userId: string; name: string; email: string; role: 'owner' | 'parent' }[]
  invitations: { id: string; email: string; role: 'owner' | 'parent'; expiresAt: string }[]
}

export function MembersPage({ familyId, role, me }: PageProps) {
  const data = useLoad(() => api.get<MembersResponse>(`/families/${familyId}/members`), [familyId])
  const m = useMsg()
  const [email, setEmail] = useState('')
  const isOwner = role === 'owner'

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    if (
      await m.run(async () => {
        await api.post(`/families/${familyId}/invitations`, { email, role: 'parent' })
        await data.reload()
      }, `Invitation sent to ${email}.`)
    )
      setEmail('')
  }

  return (
    <section>
      {(data.error || m.error) && <div className="pp-error">{data.error ?? m.error}</div>}
      {m.notice && <div className="pp-notice">{m.notice}</div>}
      <ul className="pp-list">
        {(data.data?.members ?? []).map((x) => (
          <li key={x.id} className="pp-row">
            <span className="pc-cat-emoji" aria-hidden="true">
              {x.role === 'owner' ? '👑' : '🙂'}
            </span>
            <div className="pp-row-main">
              <div className="pp-row-title">
                {x.name} {x.userId === me.user.id && <span className="pp-tag">You</span>}
              </div>
              <div className="pp-row-cat">
                {x.email} · {x.role}
              </div>
            </div>
            {(isOwner || x.userId === me.user.id) && (
              <button
                className="pp-btn pp-btn-danger"
                disabled={m.busy}
                onClick={() =>
                  window.confirm(x.userId === me.user.id ? 'Leave this family?' : `Remove ${x.name}?`) &&
                  m.run(async () => {
                    await api.del(`/families/${familyId}/members/${x.userId}`)
                    if (x.userId === me.user.id) window.location.reload()
                    else await data.reload()
                  })
                }
              >
                {x.userId === me.user.id ? 'Leave' : 'Remove'}
              </button>
            )}
          </li>
        ))}
        {(data.data?.invitations ?? []).map((i) => (
          <li key={i.id} className="pp-row is-hidden">
            <span className="pc-cat-emoji" aria-hidden="true">
              ✉️
            </span>
            <div className="pp-row-main">
              <div className="pp-row-title">{i.email}</div>
              <div className="pp-row-cat">Invited · expires {new Date(i.expiresAt).toLocaleDateString()}</div>
            </div>
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form className="pc-inline-form" onSubmit={invite}>
          <input className="pp-input" type="email" placeholder="Invite another parent by email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="pp-btn pp-btn-primary" disabled={m.busy}>
            Invite
          </button>
        </form>
      ) : (
        <p className="pc-muted">Only the family owner can invite parents.</p>
      )}
    </section>
  )
}

/* ------------------------------ settings ---------------------------- */

export function SettingsPage({ familyId, role, family, reloadMe }: PageProps & { family: Family; reloadMe: () => Promise<void> }) {
  const m = useMsg()
  const pin = useLoad(() => api.get<{ set: boolean }>(`/families/${familyId}/pin`), [familyId])
  const [name, setName] = useState(family.name)
  const [pinInput, setPinInput] = useState('')
  const [theme, setThemeState] = useState<ThemeId>(getTheme())
  const pairing = getPairing()

  return (
    <section className="pc-settings">
      {m.error && <div className="pp-error">{m.error}</div>}
      {m.notice && <div className="pp-notice">{m.notice}</div>}

      {role === 'owner' && (
        <form
          className="pp-form"
          onSubmit={(e) => {
            e.preventDefault()
            void m.run(async () => {
              await api.patch(`/families/${familyId}`, { name })
              await reloadMe()
            }, 'Family renamed.')
          }}
        >
          <h3 className="pp-form-title">Family name</h3>
          <div className="pc-inline-form">
            <input className="pp-input" value={name} onChange={(e) => setName(e.target.value)} required />
            <button className="pp-btn pp-btn-primary" disabled={m.busy}>
              Save
            </button>
          </div>
        </form>
      )}

      <form
        className="pp-form"
        onSubmit={(e) => {
          e.preventDefault()
          const p = pinInput.trim()
          void m.run(async () => {
            await api.put(`/families/${familyId}/pin`, { pin: p || null })
            setPinInput('')
            await pin.reload()
          }, p ? 'Parent PIN set.' : 'Parent PIN removed.')
        }}
      >
        <h3 className="pp-form-title">Parent PIN</h3>
        <p className="pc-muted">
          {pin.data?.set
            ? 'A PIN is set. Kids’ devices ask for it before opening the parent console.'
            : 'Set a 4–8 digit PIN so kids’ devices ask for it before opening the parent console.'}
        </p>
        <div className="pc-inline-form">
          <input
            className="pp-input"
            inputMode="numeric"
            pattern="\d{4,8}|"
            placeholder={pin.data?.set ? 'New PIN, or blank to remove' : '4–8 digits'}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
          />
          <button className="pp-btn pp-btn-primary" disabled={m.busy}>
            {pinInput.trim() ? 'Save PIN' : pin.data?.set ? 'Remove PIN' : 'Save PIN'}
          </button>
        </div>
      </form>

      <div className="pp-form">
        <h3 className="pp-form-title">Theme on this device</h3>
        <p className="pc-muted">Saved on this device only; other devices keep their own.</p>
        <div className="pc-chip-row">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`pc-chip ${theme === t.id ? 'active' : ''}`}
              aria-pressed={theme === t.id}
              onClick={() => {
                setTheme(t.id)
                setThemeState(t.id)
              }}
            >
              {t.emoji} {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="pp-form">
        <h3 className="pp-form-title">Your data</h3>
        <p className="pc-muted">Download everything this family stores (videos, categories, kids, devices, parents, change history) as a file.</p>
        <div>
          <button
            className="pp-btn pp-btn-ghost"
            disabled={m.busy}
            onClick={() =>
              void m.run(async () => {
                const res = await request<Response>('GET', `/api/v1/families/${familyId}/export`, undefined, { raw: true })
                if (!res.ok) throw new Error(`Export failed (${res.status})`)
                const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'kiddietube-export.json'
                const url = URL.createObjectURL(await res.blob())
                const a = Object.assign(document.createElement('a'), { href: url, download: name })
                a.click()
                URL.revokeObjectURL(url)
              }, 'Export downloaded.')
            }
          >
            Export family data
          </button>
        </div>
        {role === 'owner' && (
          <>
            <p className="pc-muted">
              Deleting the family permanently removes all of the above for every parent, and its devices stop working. Export first if you
              might want it back.
            </p>
            <div>
              <button
                className="pp-btn pp-btn-danger"
                disabled={m.busy}
                onClick={() => {
                  const typed = window.prompt(`This can’t be undone. Type the family name (“${family.name}”) to delete it:`)
                  if (typed == null) return
                  void m.run(async () => {
                    await api.del(`/families/${familyId}`, { confirmName: typed })
                    localStorage.removeItem('kt-family')
                    window.location.assign(`${import.meta.env.BASE_URL}parent`)
                  })
                }}
              >
                Delete family…
              </button>
            </div>
          </>
        )}
      </div>

      {pairing && (
        <div className="pp-form">
          <h3 className="pp-form-title">This device</h3>
          <p className="pc-muted">Paired as “{pairing.name}”.</p>
          <button
            className="pp-btn pp-btn-danger"
            onClick={() => {
              if (!window.confirm('Unpair this device? It will stop showing the list until it’s set up again.')) return
              clearPairing()
              window.location.reload()
            }}
          >
            Unpair this device
          </button>
        </div>
      )}
    </section>
  )
}

/* ------------------------------- admin ------------------------------ */

export function AdminPage() {
  const invites = useLoad(
    () => api.get<{ id: string; email: string; createdAt: string; expiresAt: string; usedAt: string | null }[]>('/admin/family-invites'),
    [],
  )
  const families = useLoad(() => api.get<{ id: string; name: string; createdAt: string; members: number }[]>('/admin/families'), [])
  const m = useMsg()
  const [email, setEmail] = useState('')

  return (
    <section className="pc-main">
      <h3 className="pp-form-title">Invite a new family</h3>
      <p className="pc-muted">They get an email to create their own, empty family. You won’t be a member of it and can’t see its lists.</p>
      {m.error && <div className="pp-error">{m.error}</div>}
      {m.notice && <div className="pp-notice">{m.notice}</div>}
      <form
        className="pc-inline-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (
            await m.run(async () => {
              await api.post('/admin/family-invites', { email })
              await invites.reload()
            }, `Invitation sent to ${email}.`)
          )
            setEmail('')
        }}
      >
        <input className="pp-input" type="email" placeholder="Parent’s email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="pp-btn pp-btn-primary" disabled={m.busy}>
          Send invite
        </button>
      </form>
      <ul className="pp-list">
        {(invites.data ?? []).map((i) => (
          <li key={i.id} className={`pp-row ${i.usedAt ? '' : 'is-hidden'}`}>
            <div className="pp-row-main">
              <div className="pp-row-title">{i.email}</div>
              <div className="pp-row-cat">
                {i.usedAt
                  ? `Used ${new Date(i.usedAt).toLocaleDateString()}`
                  : new Date(i.expiresAt) < new Date()
                    ? 'Expired'
                    : `Pending · expires ${new Date(i.expiresAt).toLocaleDateString()}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <h3 className="pp-form-title">Families on this server</h3>
      <ul className="pp-list">
        {(families.data ?? []).map((f) => (
          <li key={f.id} className="pp-row">
            <div className="pp-row-main">
              <div className="pp-row-title">{f.name}</div>
              <div className="pp-row-cat">
                {f.members} parent{f.members === 1 ? '' : 's'} · since {new Date(f.createdAt).toLocaleDateString()}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
