// "Get started" checklist for a new family, ticked from the family's real
// data. Hidden once videos, a kid and a paired device exist (the optional
// steps stay listed until then so nothing is missed).
import { useEffect, useState } from 'react'
import type { Category, Device, KidProfile, Video } from '@kiddietube/shared'
import { api } from '../server/api'
import { navigate } from '../router'
import { c } from './strings'

interface State {
  categories: number
  videos: number
  kids: number
  devices: number
  pin: boolean
}

/** Remembered per family once the checklist is complete, so it stops loading. */
const doneKey = (familyId: string) => `kt-getstarted-done-${familyId}`
const isDone = (familyId: string) => {
  try {
    return localStorage.getItem(doneKey(familyId)) === '1'
  } catch {
    return false
  }
}

export default function GetStarted({ familyId, path }: { familyId: string; path: string }) {
  const [s, setS] = useState<State | null>(null)
  const done = isDone(familyId)

  // re-check whenever the parent moves between pages (they may have just done a
  // step), until everything is done [review L8]
  useEffect(() => {
    setS(null)
    if (done) return
    let cancelled = false
    Promise.all([
      api.get<Category[]>(`/families/${familyId}/categories`),
      api.get<Video[]>(`/families/${familyId}/videos`),
      api.get<KidProfile[]>(`/families/${familyId}/profiles`),
      api.get<Device[]>(`/families/${familyId}/devices`),
      api.get<{ set: boolean }>(`/families/${familyId}/pin`),
    ])
      .then(([cats, v, k, d, p]) => {
        if (cancelled) return
        const next = { categories: cats.length, videos: v.length, kids: k.length, devices: d.filter((x) => !x.revoked).length, pin: p.set }
        if (next.videos > 0 && next.kids > 0 && next.devices > 0) {
          try {
            localStorage.setItem(doneKey(familyId), '1')
          } catch {
            /* storage blocked: keep checking */
          }
        }
        setS(next)
      })
      .catch(() => {}) // offline etc.: just don't show the checklist
    return () => {
      cancelled = true
    }
  }, [familyId, path, done])

  if (!s || (s.videos > 0 && s.kids > 0 && s.devices > 0)) return null

  const steps = [
    { done: s.categories > 0, label: c.stepCategories, to: '/parent/categories' },
    { done: s.videos > 0, label: c.stepVideos, to: '/parent/videos' },
    { done: s.kids > 0, label: c.stepKids, to: '/parent/profiles' },
    { done: s.devices > 0, label: c.stepDevices, to: '/parent/profiles' },
    { done: s.pin, label: c.stepPin, to: '/parent/settings' },
  ]
  return (
    <aside className="pc-getstarted" aria-label={c.getStarted}>
      <strong>{c.getStarted}</strong>
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
