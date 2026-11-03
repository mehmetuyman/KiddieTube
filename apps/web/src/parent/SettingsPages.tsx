// Parent console: members, family settings and instance admin.
import { useState, type FormEvent } from 'react'
import type { Family } from '@kiddietube/shared'
import { api, request } from '../server/api'
import { clearPairing, getPairing, revokeDevice } from '../server/device'
import { THEMES, getTheme, setTheme, type ThemeId } from '../lib/theme'
import { themeName } from '../lib/i18n'
import { c, fmtDate } from './strings'
import { LanguageSelect } from './ParentConsole'
import { useAction as useMsg, useResource as useLoad, type PageProps } from './FamilyPages'

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
      }, c.invitationSent(email))
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
                {x.name} {x.userId === me.user.id && <span className="pp-tag">{c.you}</span>}
              </div>
              <div className="pp-row-cat">
                {x.email} · {x.role === 'owner' ? c.roleOwner : c.roleParent}
              </div>
            </div>
            {(isOwner || x.userId === me.user.id) && (
              <button
                className="pp-btn pp-btn-danger"
                disabled={m.busy}
                onClick={() =>
                  window.confirm(x.userId === me.user.id ? c.confirmLeave : c.confirmRemoveMember(x.name)) &&
                  m.run(async () => {
                    await api.del(`/families/${familyId}/members/${x.userId}`)
                    if (x.userId === me.user.id) window.location.reload()
                    else await data.reload()
                  })
                }
              >
                {x.userId === me.user.id ? c.leave : c.remove}
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
              <div className="pp-row-cat">{c.invitedExpires(fmtDate(i.expiresAt))}</div>
            </div>
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form className="pc-inline-form" onSubmit={invite}>
          <input className="pp-input" type="email" placeholder={c.invitePh} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="pp-btn pp-btn-primary" disabled={m.busy}>
            {c.invite}
          </button>
        </form>
      ) : (
        <p className="pc-muted">{c.onlyOwnerInvites}</p>
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
            }, c.familyRenamed)
          }}
        >
          <h3 className="pp-form-title">{c.familyName}</h3>
          <div className="pc-inline-form">
            <input className="pp-input" value={name} onChange={(e) => setName(e.target.value)} required />
            <button className="pp-btn pp-btn-primary" disabled={m.busy}>
              {c.save}
            </button>
          </div>
        </form>
      )}

      <form
        className="pp-form"
        onSubmit={(e) => {
          e.preventDefault()
          const p = pinInput.trim()
          if (!p && !window.confirm(c.confirmRemovePin)) return // [review L10]
          void m.run(async () => {
            await api.put(`/families/${familyId}/pin`, { pin: p || null })
            setPinInput('')
            await pin.reload()
          }, p ? c.pinSet : c.pinRemoved)
        }}
      >
        <h3 className="pp-form-title">{c.parentPin}</h3>
        <p className="pc-muted">
          {pin.data?.set ? c.pinIsSet : c.pinNotSet}
        </p>
        <div className="pc-inline-form">
          <input
            className="pp-input"
            inputMode="numeric"
            pattern="\d{4,8}|"
            placeholder={pin.data?.set ? c.pinNewPh : c.pinDigitsPh}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
          />
          <button className="pp-btn pp-btn-primary" disabled={m.busy}>
            {pinInput.trim() ? c.savePin : pin.data?.set ? c.removePin : c.savePin}
          </button>
        </div>
      </form>

      <div className="pp-form">
        <h3 className="pp-form-title">{c.themeThisDevice}</h3>
        <p className="pc-muted">{c.themeDeviceOnly}</p>
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
              {t.emoji} {themeName(t)}
            </button>
          ))}
        </div>
      </div>

      <div className="pp-form">
        <h3 className="pp-form-title">{c.yourData}</h3>
        <p className="pc-muted">{c.exportText}</p>
        <div>
          <button
            className="pp-btn pp-btn-ghost"
            disabled={m.busy}
            onClick={() =>
              void m.run(async () => {
                const res = await request<Response>('GET', `/api/v1/families/${familyId}/export`, undefined, { raw: true })
                if (!res.ok) throw new Error(c.exportFailed(res.status))
                const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'kiddietube-export.json'
                const url = URL.createObjectURL(await res.blob())
                const a = Object.assign(document.createElement('a'), { href: url, download: name })
                a.click()
                URL.revokeObjectURL(url)
              }, c.exportDone)
            }
          >
            {c.exportButton}
          </button>
        </div>
        {role === 'owner' && (
          <>
            <p className="pc-muted">
              {c.deleteFamilyText}
            </p>
            <div>
              <button
                className="pp-btn pp-btn-danger"
                disabled={m.busy}
                onClick={() => {
                  const typed = window.prompt(c.deleteFamilyPrompt(family.name))
                  if (typed == null) return
                  void m.run(async () => {
                    await api.del(`/families/${familyId}`, { confirmName: typed })
                    localStorage.removeItem('kt-family')
                    window.location.assign(`${import.meta.env.BASE_URL}parent`)
                  })
                }}
              >
                {c.deleteFamily}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="pp-form">
        <h3 className="pp-form-title">{c.languageTitle}</h3>
        <p className="pc-muted">{c.languageText}</p>
        <div>
          <LanguageSelect />
        </div>
      </div>

      {pairing && (
        <div className="pp-form">
          <h3 className="pp-form-title">{c.thisDevice}</h3>
          <p className="pc-muted">{c.pairedAs(pairing.name)}</p>
          <button
            className="pp-btn pp-btn-danger"
            onClick={async () => {
              if (!window.confirm(c.confirmUnpair)) return
              await revokeDevice(pairing) // the old key stops working too [review M5]
              clearPairing()
              window.location.reload()
            }}
          >
            {c.unpair}
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
      <h3 className="pp-form-title">{c.inviteFamilyTitle}</h3>
      <p className="pc-muted">{c.inviteFamilyText}</p>
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
            }, c.invitationSent(email))
          )
            setEmail('')
        }}
      >
        <input className="pp-input" type="email" placeholder={c.parentEmailPh} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="pp-btn pp-btn-primary" disabled={m.busy}>
          {c.sendInvite}
        </button>
      </form>
      <ul className="pp-list">
        {(invites.data ?? []).map((i) => (
          <li key={i.id} className={`pp-row ${i.usedAt ? '' : 'is-hidden'}`}>
            <div className="pp-row-main">
              <div className="pp-row-title">{i.email}</div>
              <div className="pp-row-cat">
                {i.usedAt
                  ? c.used(fmtDate(i.usedAt))
                  : new Date(i.expiresAt) < new Date()
                    ? c.expired
                    : c.pendingExpires(fmtDate(i.expiresAt))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <h3 className="pp-form-title">{c.familiesOnServer}</h3>
      <ul className="pp-list">
        {(families.data ?? []).map((f) => (
          <li key={f.id} className="pp-row">
            <div className="pp-row-main">
              <div className="pp-row-title">{f.name}</div>
              <div className="pp-row-cat">
                {c.familyStats(f.members, fmtDate(f.createdAt))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
