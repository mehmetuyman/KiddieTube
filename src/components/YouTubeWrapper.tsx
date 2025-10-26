import React, { useEffect, useRef } from 'react'

const YT_PLAYER_VARS = {
  rel: 0,
  modestbranding: 1,
  controls: 0,
  disablekb: 1,
  fs: 0,
  playsinline: 1,
  enablejsapi: 1,
  origin: window.location.origin,
}

type Video = { id: string; title: string; category: string }
type Props = { 
  videoId: string | null
  videos: Video[]
}

export default function YouTubeWrapper({ videoId, videos }: Props) {
  const playerRef = useRef<any>(null)
  const playerReadyRef = useRef(false)
  const pendingRef = useRef<string | null>(null)
  const escHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null)
  const fsChangeHandlerRef = useRef<(() => void) | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const controlsVisibleRef = useRef(false)
  const progressIntervalRef = useRef<number | null>(null)
  const frameClickHandlerRef = useRef<((e: Event) => void) | null>(null)
  const frameTouchHandlerRef = useRef<(() => void) | null>(null)
  const containerMouseMoveHandlerRef = useRef<(() => void) | null>(null)
  const controlsPointerDownHandlerRef = useRef<(() => void) | null>(null)
  const controlsPointerUpHandlerRef = useRef<(() => void) | null>(null)
  const isMutedRef = useRef<boolean>(false)

  useEffect(() => {
    if (!document.getElementById('youtube-iframe-api')) {
      const script = document.createElement('script')
      script.id = 'youtube-iframe-api'
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    }

    window.onYouTubeIframeAPIReady = () => {
      // @ts-ignore
      playerRef.current = new window.YT.Player('videoPlayer', {
        width: '100%',
        height: '100%',
        playerVars: YT_PLAYER_VARS,
        events: {
          onReady: () => {
            playerReadyRef.current = true
            if (pendingRef.current) {
              // @ts-ignore
              playerRef.current.cueVideoById(pendingRef.current)
              pendingRef.current = null
            }
            attachControls()
          },
          onStateChange: (e: any) => handleStateChange(e),
        },
      })
    }

    return () => {
      // cleanup if needed
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!videoId) return
    if (playerReadyRef.current && playerRef.current) {
      playerRef.current.cueVideoById(videoId)
      updateVideoInfo(videoId)
    } else {
      pendingRef.current = videoId
    }
  }, [videoId, videos])

  function updateVideoInfo(id: string) {
    const video = videos.find(v => v.id === id)
    const titleEl = document.getElementById('videoTitle')
    const categoryEl = document.getElementById('videoCategory')
    
    if (titleEl) {
      titleEl.textContent = video ? video.title : 'Select a video to begin'
    }
    if (categoryEl) {
      categoryEl.textContent = video ? video.category : ''
    }
  }

  function updateButtonStates() {
    if (!playerRef.current) return
    
    const btnPlay = document.getElementById('btnPlay')
    const btnPause = document.getElementById('btnPause')
    const btnMute = document.getElementById('btnMute')
    const btnUnmute = document.getElementById('btnUnmute')
    const btnFullscreen = document.getElementById('btnFullscreen')
    
    // Update play/pause states
    const playerState = playerRef.current.getPlayerState?.()
    if (btnPlay && btnPause) {
      if (playerState === 1) { // Playing
        btnPlay.classList.add('active')
        btnPause.classList.remove('active')
      } else if (playerState === 2) { // Paused
        btnPlay.classList.remove('active')
        btnPause.classList.add('active')
      } else {
        btnPlay.classList.remove('active')
        btnPause.classList.remove('active')
      }
    }
    
    // Update mute/unmute states - use our tracked state
    if (btnMute && btnUnmute) {
      if (isMutedRef.current) {
        btnMute.classList.add('active')
        btnUnmute.classList.remove('active')
      } else {
        btnMute.classList.remove('active')
        btnUnmute.classList.add('active')
      }
    }
    
    // Update fullscreen state
    if (btnFullscreen) {
      const isFs = document.fullscreenElement || 
                   document.querySelector('.video-container.pseudo-fullscreen') ||
                   document.body.classList.contains('pseudo-fullscreen')
      if (isFs) {
        btnFullscreen.classList.add('active')
      } else {
        btnFullscreen.classList.remove('active')
      }
    }
  }

  function attachControls() {
    const btnPlay = document.getElementById('btnPlay')
    const btnPause = document.getElementById('btnPause')
    const btnMute = document.getElementById('btnMute')
    const btnUnmute = document.getElementById('btnUnmute')
    const btnFullscreen = document.getElementById('btnFullscreen')
    const progressBar = document.getElementById('progressBar') as HTMLInputElement | null
    const currentTimeEl = document.getElementById('currentTime')
    const durationEl = document.getElementById('duration')
  const controlsEl = document.querySelector('.custom-controls') as HTMLElement | null
  const container = document.querySelector('.video-container') as HTMLElement | null
  const frame = document.querySelector('.video-frame') as HTMLElement | null

    if (btnPlay) btnPlay.onclick = () => {
      playerRef.current?.playVideo()
      updateButtonStates()
    }
    if (btnPause) btnPause.onclick = () => {
      playerRef.current?.pauseVideo()
      updateButtonStates()
    }
    if (btnMute) btnMute.onclick = () => {
      playerRef.current?.mute()
      isMutedRef.current = true
      updateButtonStates()
    }
    if (btnUnmute) btnUnmute.onclick = () => {
      playerRef.current?.unMute()
      isMutedRef.current = false
      updateButtonStates()
    }
    if (btnFullscreen) {
      const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          // exit pseudo-fullscreen if active
          document.body.classList.remove('pseudo-fullscreen')
          const c = document.querySelector('.video-container.pseudo-fullscreen')
          c?.classList.remove('pseudo-fullscreen')
          updateButtonStates()
        }
      }
      const fsChangeHandler = () => {
        // if native fullscreen ended, ensure pseudo class is removed
        if (!document.fullscreenElement) {
          document.body.classList.remove('pseudo-fullscreen')
          const c = document.querySelector('.video-container.pseudo-fullscreen')
          c?.classList.remove('pseudo-fullscreen')
          // Hide overlay controls when exiting fullscreen
          hideControls()
        }
        updateButtonStates()
      }
      escHandlerRef.current = escHandler
      fsChangeHandlerRef.current = fsChangeHandler
      document.addEventListener('keydown', escHandler)
      document.addEventListener('fullscreenchange', fsChangeHandler)

  btnFullscreen.onclick = () => {
        const container = document.querySelector('.video-container') as HTMLElement | null
        const iframe = playerRef.current.getIframe()
        // ensure iframe allows fullscreen and autoplay where needed
        if (iframe && !iframe.hasAttribute('allowfullscreen')) {
          iframe.setAttribute('allowfullscreen', '')
          iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture')
        }

        // Check if we're already in fullscreen
        if (document.fullscreenElement) {
          // Exit fullscreen
          if (document.exitFullscreen) document.exitFullscreen()
          else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen()
          else if ((document as any).msExitFullscreen) (document as any).msExitFullscreen()
          setTimeout(() => updateButtonStates(), 100)
          return
        }

        // Try native fullscreen on the container first
        const target = container || iframe
        const requestFs = (el: any) => {
          if (!el) return false
          if (el.requestFullscreen) { el.requestFullscreen(); return true }
          if (el.webkitRequestFullscreen) { el.webkitRequestFullscreen(); return true }
          if (el.msRequestFullscreen) { el.msRequestFullscreen(); return true }
          return false
        }

        const started = requestFs(target)
        if (!started) {
          // fallback: pseudo-fullscreen (cover viewport with fixed positioned container)
          if (container) {
            const isActive = container.classList.contains('pseudo-fullscreen')
            if (isActive) {
              document.body.classList.remove('pseudo-fullscreen')
              container.classList.remove('pseudo-fullscreen')
            } else {
              document.body.classList.add('pseudo-fullscreen')
              container.classList.add('pseudo-fullscreen')
            }
            updateButtonStates()
          }
      }

      // exit pseudo-fullscreen button (touch friendly)
      const btnExit = document.getElementById('btnExitPseudoFs')
      if (btnExit) {
        btnExit.onclick = () => {
          document.body.classList.remove('pseudo-fullscreen')
          const c = document.querySelector('.video-container.pseudo-fullscreen')
          c?.classList.remove('pseudo-fullscreen')
          updateButtonStates()
        }
      }
      }
    }

    // --- show/hide overlay controls (tap to show, auto-hide) ---
    function clearHideTimer() {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }

    function hideControls() {
      if (!controlsEl) return
      controlsEl.classList.remove('visible')
      controlsVisibleRef.current = false
    }

    function isFullscreen() {
      return document.fullscreenElement !== null || container?.classList.contains('pseudo-fullscreen') || false
    }

    function showControls() {
      if (!controlsEl || !container) return
      if (!isFullscreen()) return // only show overlay in fullscreen
      controlsEl.classList.add('visible')
      controlsVisibleRef.current = true
      clearHideTimer()
      // auto-hide after 3s
      hideTimerRef.current = window.setTimeout(() => {
        if (isFullscreen()) hideControls()
      }, 3000)
    }

    // tap/click on video frame should toggle controls only in fullscreen
    if (frame) {
      const onClick = (e: Event) => {
        if (!isFullscreen()) return
        if (controlsEl && (e.target === controlsEl || controlsEl.contains(e.target as Node))) return
        if (controlsVisibleRef.current) hideControls()
        else showControls()
      }
      const onTouch = () => {
        if (isFullscreen()) showControls()
      }
      frame.addEventListener('click', onClick)
      frame.addEventListener('touchstart', onTouch)
      frameClickHandlerRef.current = onClick
      frameTouchHandlerRef.current = onTouch
    }

    // mouse activity should reveal controls briefly in fullscreen (desktop)
    if (container) {
      let mouseMoveTimer: number | null = null
      const onMouseMove = () => {
        if (!isFullscreen()) return
        showControls()
        if (mouseMoveTimer) window.clearTimeout(mouseMoveTimer)
        mouseMoveTimer = window.setTimeout(() => {
          mouseMoveTimer = null
        }, 200)
      }
      container.addEventListener('mousemove', onMouseMove)
      containerMouseMoveHandlerRef.current = onMouseMove

      // when interacting with controls keep them visible (in fullscreen)
      if (controlsEl) {
        const onPointerDown = () => {
          if (isFullscreen()) clearHideTimer()
        }
        const onPointerUp = () => {
          if (!isFullscreen()) return
          clearHideTimer()
          hideTimerRef.current = window.setTimeout(() => hideControls(), 3000)
        }
        controlsEl.addEventListener('pointerdown', onPointerDown)
        controlsEl.addEventListener('pointerup', onPointerUp)
        controlsPointerDownHandlerRef.current = onPointerDown
        controlsPointerUpHandlerRef.current = onPointerUp
      }

      // cleanup attachments when leaving attachControls scope is handled by top-level cleanup
    }

    progressIntervalRef.current = window.setInterval(() => {
      if (playerRef.current && playerRef.current.getDuration) {
        const duration = playerRef.current.getDuration()
        const current = playerRef.current.getCurrentTime()

        if (!isNaN(duration) && duration > 0) {
          if (progressBar) {
            progressBar.max = String(duration)
            progressBar.value = String(current)
            const percent = (current / duration) * 100
            progressBar.style.background = `linear-gradient(to right, red 0%, red ${percent}%, #555 ${percent}%, #555 100%)`
          }

          if (currentTimeEl) currentTimeEl.textContent = formatTime(current)
          if (durationEl) durationEl.textContent = formatTime(duration)
        }
      }
  }, 1000)

    if (progressBar) {
      progressBar.addEventListener('input', () => {
        playerRef.current?.seekTo(Number(progressBar.value), true)
      })
    }

    // Initialize button states
    setTimeout(() => updateButtonStates(), 500)

    // end attachControls

    function formatTime(sec: number) {
      const minutes = Math.floor(sec / 60)
      const seconds = Math.floor(sec % 60)
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
    }
  }

  function handleStateChange(event: any) {
    const pauseShield = document.querySelector('.pause-shield')
    const statusEl = document.getElementById('videoStatus')
    
    // YT.PlayerState: -1 = unstarted, 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
    if (event.data === 2) {
      pauseShield?.classList.add('visible')
      if (statusEl) {
        statusEl.textContent = 'Paused'
        statusEl.className = 'badge text-bg-warning'
      }
    } else {
      pauseShield?.classList.remove('visible')
      if (statusEl) {
        if (event.data === 1) {
          statusEl.textContent = 'Playing'
          statusEl.className = 'badge text-bg-success'
        } else if (event.data === 0) {
          statusEl.textContent = 'Ended'
          statusEl.className = 'badge text-bg-secondary'
        } else if (event.data === 3) {
          statusEl.textContent = 'Buffering'
          statusEl.className = 'badge text-bg-info'
        } else if (event.data === 5) {
          statusEl.textContent = 'Ready'
          statusEl.className = 'badge text-bg-primary'
        } else {
          statusEl.textContent = 'Idle'
          statusEl.className = 'badge text-bg-secondary'
        }
      }
    }
    
    // Update button states when player state changes
    updateButtonStates()
  }

  // cleanup handlers when component unmounts
  useEffect(() => {
    return () => {
      if (escHandlerRef.current) document.removeEventListener('keydown', escHandlerRef.current)
      if (fsChangeHandlerRef.current) document.removeEventListener('fullscreenchange', fsChangeHandlerRef.current)
      // remove any listeners we added to DOM nodes
      const frame = document.querySelector('.video-frame') as HTMLElement | null
      const container = document.querySelector('.video-container') as HTMLElement | null
      const controlsEl = document.querySelector('.custom-controls') as HTMLElement | null
      if (frame) {
        if (frameClickHandlerRef.current) frame.removeEventListener('click', frameClickHandlerRef.current)
        if (frameTouchHandlerRef.current) frame.removeEventListener('touchstart', frameTouchHandlerRef.current)
      }
      if (container) {
        if (containerMouseMoveHandlerRef.current) container.removeEventListener('mousemove', containerMouseMoveHandlerRef.current)
        // remove overlay class
        container.classList.remove('controls-overlay')
      }
      if (controlsEl) {
        if (controlsPointerDownHandlerRef.current) controlsEl.removeEventListener('pointerdown', controlsPointerDownHandlerRef.current)
        if (controlsPointerUpHandlerRef.current) controlsEl.removeEventListener('pointerup', controlsPointerUpHandlerRef.current)
        controlsEl.classList.remove('visible')
      }
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }
  }, [])

  return null
}
