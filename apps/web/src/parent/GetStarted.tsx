// "Get started" checklist for a new family, ticked from the family's real
// data. Hidden once videos, a kid and a paired device exist (the optional
// steps stay listed until then so nothing is missed).
import { useEffect, useState } from 'react'
import type { Category, Device, KidProfile, Video } from '@kiddietube/shared'
import { api } from '../server/api'
import { navigate } from '../router'

interface State {
  categories: number
  videos: number
  kids: number
  devices: number
  pin: boolean
}

export default function GetStarted({ familyId, path }: { familyId: string; path: string }) {
  const [s, setS] = useState<State | null>(null)

  // re-check whenever the parent moves between pages (they may have just done a step)
  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get<Category[]>(`/families/${familyId}/categories`),
      api.get<Video[]>(`/families/${familyId}/videos`),
      api.get<KidProfile[]>(`/families/${familyId}/profiles`),
      api.get<Device[]>(`/families/${familyId}/devices`),
      api.get<{ set: boolean }>(`/families/${familyId}/pin`),
    ])
      .then(([c, v, k, d, p]) => {
        if (!cancelled)
          setS({ categories: c.length, videos: v.length, kids: k.length, devices: d.filter((x) => !x.revoked).length, pin: p.set })
      })
      .catch(() => {}) // offline etc.: just don't show the checklist
    return () => {
      cancelled = true
    }
  }, [familyId, path])

  if (!s || (s.videos > 0 && s.kids > 0 && s.devices > 0)) return null

  const steps = [
    { done: s.categories > 0, label: 'Create a few categories (optional)', to: '/parent/categories' },
    { done: s.videos > 0, label: 'Add videos with YouTube links', to: '/parent/videos' },
    { done: s.kids > 0, label: 'Add your kids', to: '/parent/profiles' },
    { done: s.devices > 0, label: 'On each kid’s phone/tablet: sign in, Kids → “Use this device”', to: '/parent/profiles' },
    { done: s.pin, label: 'Set a parent PIN (optional)', to: '/parent/settings' },
  ]
  return (
    <aside className="pc-getstarted" aria-label="Get started">
      <strong>Get started</strong>
      <ol>
        {steps.map((st) => (
          <li key={st.label} className={st.done ? 'done' : ''}>
            <span aria-hidden="true">{st.done ? '✅' : '⬜'}</span>{' '}
            {st.done ? (
              st.label
            ) : (
              <a href="#" onClick={(e) => (e.preventDefault(), navigate(st.to))}>
                {st.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </aside>
  )
}
