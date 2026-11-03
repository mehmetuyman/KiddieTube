// "New version available" prompt. The service worker downloads updates in
// the background but waits; tapping the banner activates the new version and
// reloads. Also re-checks for updates hourly and whenever the app is reopened.
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export default function UpdateBanner() {
  const [update, setUpdate] = useState<null | (() => void)>(null)

  useEffect(() => {
    let registration: ServiceWorkerRegistration | undefined
    const updateSW = registerSW({
      onNeedRefresh: () => setUpdate(() => () => void updateSW(true)),
      onRegisteredSW: (_url, reg) => {
        registration = reg
      },
    })
    const check = () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => {})
    }
    const timer = window.setInterval(check, 60 * 60 * 1000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  if (!update) return null
  return (
    <div className="update-banner" role="status">
      <span>✨ A new version of Kiddie Tube is ready.</span>
      <button className="update-banner-btn" onClick={update}>
        Update
      </button>
    </div>
  )
}
