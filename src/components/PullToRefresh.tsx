import React, { useEffect, useRef, useState } from 'react'

export default function PullToRefresh() {
  const [pulling, setPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const startYRef = useRef<number>(0)
  const isPullingRef = useRef(false)
  const threshold = 80 // pixels to pull before triggering refresh

  useEffect(() => {
    let touchStartY = 0
    let touchMoveY = 0

    const handleTouchStart = (e: TouchEvent) => {
      // Ignore touches on video player and controls
      const target = e.target as HTMLElement
      if (
        target.closest('.video-container') ||
        target.closest('.custom-controls') ||
        target.closest('button') ||
        target.closest('input[type="range"]') ||
        target.closest('.player-sticky-wrapper')
      ) {
        return
      }

      // Only start pull if at the top of the page
      if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY
        startYRef.current = touchStartY
        isPullingRef.current = false
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (window.scrollY > 0) return

      // Ignore touches on video player and controls (check during move too)
      const target = e.target as HTMLElement
      if (
        target.closest('.video-container') ||
        target.closest('.custom-controls') ||
        target.closest('button') ||
        target.closest('input[type="range"]') ||
        target.closest('.player-sticky-wrapper')
      ) {
        return
      }

      touchMoveY = e.touches[0].clientY
      const distance = touchMoveY - touchStartY

      // Only allow pulling down
      if (distance > 0 && window.scrollY === 0) {
        isPullingRef.current = true
        setPulling(true)
        
        // Apply resistance to pull distance (feels more natural)
        const resistedDistance = Math.min(distance * 0.5, threshold * 1.5)
        setPullDistance(resistedDistance)

        // Prevent default scroll if pulling
        if (distance > 10) {
          e.preventDefault()
        }
      }
    }

    const handleTouchEnd = () => {
      if (isPullingRef.current && pullDistance > threshold) {
        // Trigger refresh
        setPulling(false)
        setPullDistance(0)
        
        // Add a small delay for visual feedback
        setTimeout(() => {
          window.location.reload()
        }, 200)
      } else {
        // Reset without refresh
        setPulling(false)
        setPullDistance(0)
      }
      
      isPullingRef.current = false
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [pullDistance])

  if (!pulling && pullDistance === 0) return null

  const rotation = Math.min((pullDistance / threshold) * 360, 360)
  const opacity = Math.min(pullDistance / threshold, 1)

  return (
    <div 
      className="pull-to-refresh-indicator"
      style={{
        transform: `translateY(${Math.min(pullDistance, threshold + 20)}px)`,
        opacity: opacity
      }}
    >
      <div 
        className="refresh-spinner"
        style={{
          transform: `rotate(${rotation}deg)`
        }}
      >
        ↻
      </div>
      {pullDistance > threshold && (
        <span className="refresh-text">Release to refresh</span>
      )}
    </div>
  )
}
