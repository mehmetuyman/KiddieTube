// A password field with a show/hide ("eye") button, so a parent can check
// what they typed. Used wherever a password or token is entered.
import { useState, type InputHTMLAttributes } from 'react'
import { t } from '../lib/i18n'

export default function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <span className="pp-password">
      <input {...props} className={props.className ?? 'pp-input'} type={shown ? 'text' : 'password'} autoCapitalize="off" spellCheck={false} />
      <button
        type="button"
        className="pp-password-toggle"
        aria-label={shown ? t.hidePassword : t.showPassword}
        aria-pressed={shown}
        title={shown ? t.hidePassword : t.showPassword}
        onClick={() => setShown((s) => !s)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </span>
  )
}
