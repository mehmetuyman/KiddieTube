import { RefObject, useEffect } from 'react'

const DRAG_THRESHOLD = 6 // px of movement before a press counts as a drag

/**
 * Make a horizontal scroller usable with a mouse, the way touch users can swipe
 * it: the vertical wheel scrolls it sideways, and it can be click-dragged.
 * A drag doesn't also "click" the item it started on. Touch and pen input are
 * left to the browser's native scrolling.
 */
export function useDragScroll(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // pinch-zoom / ctrl+wheel
      // already horizontal (touchpad swipe, shift+wheel) - browser handles it
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      // at either end, let the wheel scroll the page as usual
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }

    let pointerId: number | null = null
    let startX = 0
    let startScroll = 0
    let dragging = false
    let suppressClick = false

    const onPointerDown = (e: PointerEvent) => {
      // a drag released off the element leaves no click to swallow; every
      // real click starts with a fresh press, so reset here
      suppressClick = false
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      pointerId = e.pointerId
      startX = e.clientX
      startScroll = el.scrollLeft
      dragging = false
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      const dx = e.clientX - startX
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return
        dragging = true
        // capture only once it's a drag, so plain clicks still reach the pill
        el.setPointerCapture(e.pointerId)
        el.classList.add('is-dragging')
      }
      el.scrollLeft = startScroll - dx
    }

    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      if (dragging) {
        suppressClick = true
        el.classList.remove('is-dragging')
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      }
      pointerId = null
      dragging = false
    }

    // swallow the click that follows a drag so it doesn't pick a category
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClick) return
      suppressClick = false
      e.preventDefault()
      e.stopPropagation()
    }

    const preventNativeDrag = (e: DragEvent) => e.preventDefault()

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('dragstart', preventNativeDrag)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('dragstart', preventNativeDrag)
    }
  }, [ref])
}
