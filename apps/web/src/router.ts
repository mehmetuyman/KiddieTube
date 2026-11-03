// Minimal client-side routing (server mode): the kids' page at "/", the
// parent console under "/parent", and the email-link landing pages.
import { useEffect, useState } from 'react'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

/** Current path relative to the app's base, e.g. "/parent/videos". */
export function currentPath(): string {
  const p = window.location.pathname
  const rel = p.startsWith(base) ? p.slice(base.length) : p
  return rel || '/'
}

export function navigate(path: string, { replace = false } = {}) {
  const url = `${base}${path}`
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const on = () => setPath(currentPath())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  return path
}

export const query = (name: string) => new URLSearchParams(window.location.search).get(name)

/** Path + query of the current page, relative to the base (to come back to it later). */
export const here = () => currentPath() + window.location.search

/** A same-app path from ?next=, or the fallback (never another site). */
export function nextPath(fallback: string): string {
  const n = query('next')
  return n && n.startsWith('/') && !n.startsWith('//') ? n : fallback
}
