import { RefObject, useEffect } from 'react'

const COMPACT_AT = 40 // px scrolled before the top bar shrinks
const EXPAND_AT = 8 // ...and back near the very top it grows again

/**
 * Top bar (header + category row) pinned to the top of the screen, shrinking
 * to a compact size once the page scrolls and growing back at the top.
 *
 * The bar is `position: fixed` rather than sticky: sticky proved unreliable on
 * iPhone (any ancestor overflow setting silently disables it), while fixed is
 * independent of the page structure. Being fixed, it takes no space in the
 * page, so `spacerRef` - an empty element right after it - is kept at the bar's
 * FULL height. The spacer never changes when the bar compacts, so the content
 * below can't jump.
 *
 * Adds `is-compact` to the bar; the compact look lives in CSS.
 */
export function useCompactOnScroll(ref: RefObject<HTMLElement>, spacerRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current
    const spacer = spacerRef.current
    if (!el || !spacer) return

    let compact = false
    let toggledAt = 0 // the size switch itself isn't a content change - don't re-measure mid-animation

    // Full-size height, measured with the compact look and transitions off
    // (fonts, theme, orientation and screen width all affect it).
    const syncSpacer = () => {
      el.classList.add('is-measuring')
      if (compact) el.classList.remove('is-compact')
      const full = el.offsetHeight
      if (compact) el.classList.add('is-compact')
      void el.offsetHeight // commit before transitions resume
      el.classList.remove('is-measuring')
      if (full > 0) spacer.style.height = `${full}px`
    }

    // Cheap enough to run on every scroll event: it only touches the DOM when
    // crossing a threshold.
    const onScroll = () => {
      const y = window.scrollY
      if (!compact && y > COMPACT_AT) {
        compact = true
        toggledAt = Date.now()
        el.classList.add('is-compact')
      } else if (compact && y <= EXPAND_AT) {
        compact = false
        toggledAt = Date.now()
        el.classList.remove('is-compact')
      }
    }

    syncSpacer()
    onScroll() // e.g. reload while scrolled down

    // re-measure when the bar's content or the screen changes
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (!compact && Date.now() - toggledAt > 400) syncSpacer()
          })
        : null
    ro?.observe(el)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', syncSpacer)
    document.fonts?.ready.then(syncSpacer).catch(() => {})

    return () => {
      ro?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', syncSpacer)
    }
  }, [ref, spacerRef])
}
