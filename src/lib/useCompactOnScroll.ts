import { RefObject, useEffect } from 'react'

const COMPACT_AT = 40 // px scrolled before the top bar shrinks
const EXPAND_AT = 8 // ...and back near the very top it grows again

/**
 * Shrink a sticky top block (header + category row) once the page scrolls, and
 * grow it back at the top - without the content underneath jumping.
 *
 * A sticky element still takes up space in the page flow, so shrinking it
 * would pull everything below it up. To prevent that, the height it gives up is
 * added back as `margin-bottom` (both animate with the same timing in CSS, so
 * their sum - the space in the flow - stays constant).
 *
 * Adds `is-compact` to the element; the compact look lives in CSS.
 */
export function useCompactOnScroll(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let compact = false

    // Height difference between the full and compact layout, measured with
    // transitions off (fonts, theme and screen width all affect it).
    const measureDelta = (): number => {
      el.classList.add('is-measuring')
      const full = el.offsetHeight
      el.classList.add('is-compact')
      const small = el.offsetHeight
      el.classList.remove('is-compact')
      void el.offsetHeight // commit the full layout before transitions resume
      el.classList.remove('is-measuring')
      return Math.max(0, full - small)
    }

    const setCompact = (next: boolean) => {
      if (next === compact) return
      compact = next
      if (next) {
        const delta = measureDelta()
        el.classList.add('is-compact')
        el.style.marginBottom = `${delta}px`
      } else {
        el.classList.remove('is-compact')
        el.style.marginBottom = '0px'
      }
    }

    // Cheap enough to run on every scroll event: it only touches the DOM when
    // crossing a threshold.
    const onScroll = () => {
      const y = window.scrollY
      if (!compact && y > COMPACT_AT) setCompact(true)
      else if (compact && y <= EXPAND_AT) setCompact(false)
    }

    // a resize/rotation changes the sizes; re-measure by toggling back
    const onResize = () => {
      if (!compact) return
      compact = false
      el.classList.remove('is-compact')
      el.style.marginBottom = '0px'
      onScroll()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    onScroll() // e.g. reload while scrolled down
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [ref])
}
