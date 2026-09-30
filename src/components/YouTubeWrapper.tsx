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

// Speeds offered by the speed button (cycled in order), limited to what the
// current video supports.
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5]
const LS_SPEED = 'kiddietube-playback-rate'

function readSavedSpeed(): number {
  try {
    const n = Number(localStorage.getItem(LS_SPEED))
    return SPEEDS.includes(n) ? n : 1
  } catch {
    return 1
  }
}

function formatSpeed(rate: number): string {
  return `${rate}x`
}

type Props = {
  videoId: string | null
  autoPlay?: boolean
  /** Incremented on every explicit tap so re-selecting the current video replays it. */
  playRequest?: number
}

export default function YouTubeWrapper({ videoId, autoPlay = false, playRequest = 0 }: Props) {
  const playerRef = useRef<any>(null)
  const playerReadyRef = useRef(false)
  const pendingRef = useRef<string | null>(null)
  const autoPlayRef = useRef<boolean>(autoPlay)
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
  const controlsAttachedRef = useRef(false)
  const orientationHandlerRef = useRef<(() => void) | null>(null)
  const orientationMediaRef = useRef<MediaQueryList | null>(null)
  const progressInputHandlerRef = useRef<(() => void) | null>(null)
  const progressChangeHandlerRef = useRef<(() => void) | null>(null)
  const seekingRef = useRef(false)
  const seekIdleTimerRef = useRef<number | null>(null)
  const autoFullscreenRef = useRef(false)
  const lockedScrollRef = useRef(0) // page scroll position while pseudo-fullscreen
  const viewportHandlerRef = useRef<(() => void) | null>(null)
  const touchShownAtRef = useRef(0) // when a touch last revealed the controls
  const lastLockStateRef = useRef<boolean | null>(null)
  // the speed the parent picked; re-applied because YouTube can reset it to 1
  // when a new video loads
  const speedRef = useRef<number>(readSavedSpeed())

  useEffect(() => {
    if (!document.getElementById('youtube-iframe-api')) {
      const script = document.createElement('script')
      script.id = 'youtube-iframe-api'
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    }

    let cancelled = false
    const createPlayer = () => {
      if (cancelled || playerRef.current) return
      playerRef.current = new window.YT.Player('videoPlayer', {
        width: '100%',
        height: '100%',
        playerVars: YT_PLAYER_VARS,
        events: {
          onReady: () => {
            if (cancelled) return
            playerReadyRef.current = true
            if (pendingRef.current) {
              // Only cue on initial load, don't auto-play
              playerRef.current.cueVideoById(pendingRef.current)
              pendingRef.current = null
            }
            attachControls()
          },
          onStateChange: (e: any) => handleStateChange(e),
          onPlaybackRateChange: (e: any) => updateSpeedLabel(e.data),
        },
      })
    }

    // The API script calls onYouTubeIframeAPIReady only once. If it has already
    // loaded (remount, HMR), create the player straight away.
    if (window.YT && window.YT.Player) createPlayer()
    else window.onYouTubeIframeAPIReady = createPlayer

    return () => {
      cancelled = true
      playerReadyRef.current = false
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* player already gone */
      }
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    autoPlayRef.current = autoPlay
  }, [autoPlay])

  useEffect(() => {
    if (!videoId) return
    if (playerReadyRef.current && playerRef.current) {
      // Load video - only auto-play if explicitly requested
      if (autoPlayRef.current) {
        playerRef.current.loadVideoById(videoId)
      } else {
        playerRef.current.cueVideoById(videoId)
      }
    } else {
      pendingRef.current = videoId
    }
    // Deliberately not keyed on the video list: editing titles in the parent
    // panel must not restart the video that is playing.
  }, [videoId, playRequest])

  function updateButtonStates() {
    if (!playerRef.current) return

    const btnPlayPause = document.getElementById('btnPlayPause')
    const btnFullscreen = document.getElementById('btnFullscreen')

    // Update play/pause button text and state
    const playerState = playerRef.current.getPlayerState?.()
    if (btnPlayPause) {
      if (playerState === 1) { // Playing
        btnPlayPause.textContent = '⏸'
        btnPlayPause.classList.add('active')
      } else { // Paused or other
        btnPlayPause.textContent = '▶'
        btnPlayPause.classList.remove('active')
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

  function updateSpeedLabel(rate?: number) {
    const btn = document.getElementById('btnSpeed')
    if (!btn) return
    const r = typeof rate === 'number' ? rate : playerRef.current?.getPlaybackRate?.() ?? speedRef.current
    btn.textContent = formatSpeed(r)
    btn.classList.toggle('active', r !== 1)
  }

  function availableSpeeds(): number[] {
    const supported: number[] = playerRef.current?.getAvailablePlaybackRates?.() ?? []
    const usable = SPEEDS.filter((s) => supported.includes(s))
    return usable.length ? usable : SPEEDS
  }

  // Apply the chosen speed to the current video if it differs.
  function applySpeed() {
    const p = playerRef.current
    if (!p?.setPlaybackRate) return
    if (p.getPlaybackRate?.() !== speedRef.current) p.setPlaybackRate(speedRef.current)
    updateSpeedLabel()
  }

  // Pseudo-fullscreen = the player container covers the viewport (position:
  // fixed) and the page underneath is locked. It's the only fullscreen iPhones
  // get. The page is locked *at its current scroll position* (body fixed with a
  // negative top) and put back on exit: pinning it at 0 made the page jump,
  // lost the scroll position, and on iOS left touch targets out of step with
  // what's drawn after a rotation.
  function enterPseudoFullscreen(auto: boolean) {
    const container = document.querySelector('.video-container') as HTMLElement | null
    if (!container || container.classList.contains('pseudo-fullscreen')) return
    const y = window.scrollY
    lockedScrollRef.current = y
    document.body.style.top = `-${y}px`
    document.body.classList.add('pseudo-fullscreen')
    container.classList.add('pseudo-fullscreen')
    autoFullscreenRef.current = auto
    updateButtonStates()
  }

  function exitPseudoFullscreen() {
    autoFullscreenRef.current = false
    const wasPseudo = document.body.classList.contains('pseudo-fullscreen')
    document.body.classList.remove('pseudo-fullscreen')
    document.body.style.top = ''
    document.querySelector('.video-container.pseudo-fullscreen')?.classList.remove('pseudo-fullscreen')
    // instant: Bootstrap turns on smooth scrolling for the whole page, which
    // would visibly scroll down from the top
    if (wasPseudo) window.scrollTo({ top: lockedScrollRef.current, behavior: 'instant' as ScrollBehavior })
    // overlay controls are only shown in fullscreen
    document.querySelector('.custom-controls')?.classList.remove('visible')
    document.getElementById('btnExitPseudoFs')?.classList.remove('visible')
    controlsVisibleRef.current = false
    updateButtonStates()
  }

  // iOS WebKit can keep stale touch targets after a rotation: things are drawn
  // in the new place but respond in the old one (rotating back "fixes" it).
  // Runs once a rotation has settled, in fullscreen AND on the normal page
  // (e.g. after leaving auto-fullscreen by rotating back to portrait):
  // rebuilding the layers and nudging the scroll position makes WebKit
  // recompute them.
  function refreshTouchTargets() {
    const inPseudo = document.body.classList.contains('pseudo-fullscreen')
    const els = document.querySelectorAll<HTMLElement>(
      inPseudo
        ? '.video-container .custom-controls, #btnExitPseudoFs, .video-container .iframe-guard-full'
        : '.video-container .custom-controls, .app-top, .video-container .iframe-guard-full',
    )
    els.forEach((el) => (el.style.display = 'none'))
    void document.body.offsetHeight
    els.forEach((el) => (el.style.display = ''))
    if (!inPseudo) {
      const y = window.scrollY
      const nudge = y > 0 ? y - 1 : y + 1
      window.scrollTo({ top: nudge, behavior: 'instant' as ScrollBehavior })
      window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })
    }
  }

  // Lock to portrait when not playing, allow rotation when playing. Driven by
  // player state changes (not polled) and only acts when the wanted lock changes.
  function updateOrientationLock(isPlaying: boolean) {
    if (lastLockStateRef.current === isPlaying) return
    lastLockStateRef.current = isPlaying
    const orientation: any = screen.orientation
    if (!orientation || typeof orientation.lock !== 'function') return
    try {
      if (isPlaying) orientation.unlock()
      else orientation.lock('portrait').catch(() => { /* unsupported outside installed PWA / fullscreen */ })
    } catch {
      /* ignore */
    }
  }

  function attachControls() {
    // Guard against wiring the same DOM/window listeners twice (e.g. a second
    // player `onReady`, or a StrictMode double-mount in development).
    if (controlsAttachedRef.current) return
    controlsAttachedRef.current = true

    const btnPlayPause = document.getElementById('btnPlayPause')
    const btnSkipBack = document.getElementById('btnSkipBack')
    const btnSkipForward = document.getElementById('btnSkipForward')
    const btnFullscreen = document.getElementById('btnFullscreen')
    const btnExitPseudoFs = document.getElementById('btnExitPseudoFs')
    const progressBar = document.getElementById('progressBar') as HTMLInputElement | null
    const currentTimeEl = document.getElementById('currentTime')
    const durationEl = document.getElementById('duration')
    const controlsEl = document.querySelector('.custom-controls') as HTMLElement | null
    const container = document.querySelector('.video-container') as HTMLElement | null
    const frame = document.querySelector('.video-frame') as HTMLElement | null

    // Single Play/Pause toggle button
    if (btnPlayPause) {
      btnPlayPause.onclick = () => {
        if (!playerRef.current) return
        const state = playerRef.current.getPlayerState?.()
        if (state === 1) { // Playing
          playerRef.current.pauseVideo()
          btnPlayPause.textContent = '▶'
        } else { // Paused or other
          playerRef.current.playVideo()
          btnPlayPause.textContent = '⏸'
        }
      }
    }

    // Playback speed: cycle through the speeds this video supports
    const btnSpeed = document.getElementById('btnSpeed')
    if (btnSpeed) {
      btnSpeed.onclick = () => {
        if (!playerRef.current) return
        const speeds = availableSpeeds()
        const i = speeds.indexOf(speedRef.current)
        const next = speeds[(i + 1) % speeds.length] ?? 1
        speedRef.current = next
        try {
          localStorage.setItem(LS_SPEED, String(next))
        } catch {
          /* ignore */
        }
        playerRef.current.setPlaybackRate(next)
        updateSpeedLabel(next)
      }
      updateSpeedLabel(speedRef.current)
    }

    // Skip backward 10 seconds
    if (btnSkipBack) {
      btnSkipBack.onclick = () => {
        if (!playerRef.current) return
        const currentTime = playerRef.current.getCurrentTime?.() || 0
        playerRef.current.seekTo(Math.max(0, currentTime - 10), true)
      }
    }

    // Skip forward 10 seconds
    if (btnSkipForward) {
      btnSkipForward.onclick = () => {
        if (!playerRef.current) return
        const currentTime = playerRef.current.getCurrentTime?.() || 0
        const duration = playerRef.current.getDuration?.() || 0
        playerRef.current.seekTo(Math.min(duration, currentTime + 10), true)
      }
    }

    // Fullscreen and exit fullscreen buttons
    if (btnFullscreen) {
      const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') exitPseudoFullscreen()
      }
      const fsChangeHandler = () => {
        // if native fullscreen ended, ensure pseudo class is removed
        if (!document.fullscreenElement) {
          exitPseudoFullscreen()
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
        if (!playerRef.current) return

        // Already in pseudo-fullscreen (e.g. entered on landscape rotation):
        // the button toggles it off rather than stacking native fullscreen on top.
        if (container?.classList.contains('pseudo-fullscreen')) {
          exitPseudoFullscreen()
          return
        }

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

        // fallback: pseudo-fullscreen (cover viewport with fixed positioned container)
        const enterPseudo = () => enterPseudoFullscreen(false)

        // Try native fullscreen on the container first
        const target: any = container || iframe
        const request =
          target?.requestFullscreen || target?.webkitRequestFullscreen || target?.msRequestFullscreen
        if (!request) {
          enterPseudo()
          return
        }
        try {
          const result = request.call(target)
          // requestFullscreen() returns a promise that rejects when the browser
          // refuses (permissions policy, no user gesture...). Fall back then too.
          if (result && typeof result.catch === 'function') result.catch(enterPseudo)
        } catch {
          enterPseudo()
        }
      }
    }

    // Exit fullscreen button (touch friendly). Wired at attach time - not
    // inside btnFullscreen.onclick - so it also works when pseudo-fullscreen
    // was entered automatically on landscape rotation.
    if (btnExitPseudoFs) {
      btnExitPseudoFs.onclick = () => {
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen()
        exitPseudoFullscreen()
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
      // Also hide minimize button
      const btnExit = document.getElementById('btnExitPseudoFs')
      if (btnExit) btnExit.classList.remove('visible')
    }

    function isFullscreen() {
      return document.fullscreenElement !== null || container?.classList.contains('pseudo-fullscreen') || false
    }

    function showControls() {
      if (!controlsEl || !container) return
      if (!isFullscreen()) return // only show overlay in fullscreen
      controlsEl.classList.add('visible')
      controlsVisibleRef.current = true
      // Also show minimize button
      const btnExit = document.getElementById('btnExitPseudoFs')
      if (btnExit) btnExit.classList.add('visible')
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
        // A finger tap fires touchstart (which already showed the controls)
        // and then click - don't let that same tap hide them again.
        if (Date.now() - touchShownAtRef.current < 600) return
        if (controlsVisibleRef.current) hideControls()
        else showControls()
      }
      const onTouch = () => {
        if (!isFullscreen()) return
        // tapping while they're showing hides them (handled by the click)
        if (controlsVisibleRef.current) return
        touchShownAtRef.current = Date.now()
        showControls()
      }
      frame.addEventListener('click', onClick)
      frame.addEventListener('touchstart', onTouch, { passive: true })
      frameClickHandlerRef.current = onClick
      frameTouchHandlerRef.current = onTouch
    }

    // mouse activity should reveal controls briefly in fullscreen (desktop)
    if (container) {
      const onMouseMove = () => {
        if (isFullscreen()) showControls()
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
    }

    progressIntervalRef.current = window.setInterval(() => {
      if (playerRef.current && playerRef.current.getDuration) {
        const duration = playerRef.current.getDuration()
        const current = playerRef.current.getCurrentTime()

        if (!isNaN(duration) && duration > 0) {
          // don't yank the thumb out from under a finger that is dragging it
          if (progressBar && !seekingRef.current) {
            progressBar.max = String(duration)
            progressBar.value = String(current)
            const percent = (current / duration) * 100
            // colours come from the active theme (see --kt-progress-* in styles-v2.css)
            progressBar.style.background = `linear-gradient(to right, var(--kt-progress-fill) 0%, var(--kt-progress-fill) ${percent}%, var(--kt-progress-rest) ${percent}%, var(--kt-progress-rest) 100%)`
          }

          if (currentTimeEl) currentTimeEl.textContent = formatTime(current)
          if (durationEl) durationEl.textContent = formatTime(duration)
        }
      }
    }, 1000)

    if (progressBar) {
      // While dragging only preview (allowSeekAhead=false); commit the real
      // seek once on release instead of a network request per pixel.
      const onChange = () => {
        if (seekIdleTimerRef.current) window.clearTimeout(seekIdleTimerRef.current)
        seekIdleTimerRef.current = null
        seekingRef.current = false
        playerRef.current?.seekTo(Number(progressBar.value), true)
      }
      const onInput = () => {
        seekingRef.current = true
        playerRef.current?.seekTo(Number(progressBar.value), false)
        // safety net: if `change` never arrives, commit after a pause in input
        // so the bar can't stay frozen
        if (seekIdleTimerRef.current) window.clearTimeout(seekIdleTimerRef.current)
        seekIdleTimerRef.current = window.setTimeout(onChange, 1500)
      }
      progressBar.addEventListener('input', onInput)
      progressBar.addEventListener('change', onChange)
      progressInputHandlerRef.current = onInput
      progressChangeHandlerRef.current = onChange
    }

    // Initialize button states
    setTimeout(() => updateButtonStates(), 500)

    // Landscape while playing -> pseudo-fullscreen; back to portrait -> leave
    // it again, but only if it was entered automatically.
    const applyOrientation = () => {
      const container = document.querySelector('.video-container') as HTMLElement | null
      if (!container) return

      const isLandscape = window.matchMedia('(orientation: landscape)').matches
      if (!isLandscape) {
        if (autoFullscreenRef.current) exitPseudoFullscreen()
        return
      }

      // Only trigger if video is playing
      const playerState = playerRef.current?.getPlayerState?.()
      if (playerState !== 1) return

      const isAlreadyFullscreen = document.fullscreenElement || container.classList.contains('pseudo-fullscreen')
      if (!isAlreadyFullscreen) enterPseudoFullscreen(true)
    }

    // A rotation is handled only once it has settled (iOS reports the new size
    // late, and entering/leaving fullscreen mid-rotation left stale touch
    // targets): then apply auto-fullscreen and refresh the touch targets.
    // Any resize also re-arms the timer, so this runs after the last one.
    let settleTimer: number | null = null
    let rotationPending = false
    const settle = () => {
      if (settleTimer) window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        settleTimer = null
        if (rotationPending) {
          rotationPending = false
          applyOrientation()
        }
        // after the layout change above has been laid out
        window.setTimeout(refreshTouchTargets, 60)
      }, 350)
    }
    const handleOrientationChange = () => {
      rotationPending = true
      settle()
    }
    const onViewportChange = () => settle()
    window.addEventListener('resize', onViewportChange)
    viewportHandlerRef.current = onViewportChange

    // The media query fires on rotation everywhere `orientationchange` does;
    // listening to both ran the handler twice per rotation.
    const orientationMedia = window.matchMedia('(orientation: landscape)')
    orientationMedia.addEventListener('change', handleOrientationChange)

    // Track for cleanup on unmount
    orientationHandlerRef.current = handleOrientationChange
    orientationMediaRef.current = orientationMedia

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
    const btnPlayPause = document.getElementById('btnPlayPause')

    // YT.PlayerState: -1 = unstarted, 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
    if (event.data === 2) {
      pauseShield?.classList.add('visible')
      if (statusEl) {
        statusEl.textContent = 'Paused'
        statusEl.className = 'status-badge badge text-bg-warning'
      }
      if (btnPlayPause) btnPlayPause.textContent = '▶'
    } else {
      pauseShield?.classList.remove('visible')
      if (btnPlayPause && event.data === 1) btnPlayPause.textContent = '⏸'
      if (statusEl) {
        if (event.data === 1) {
          statusEl.textContent = 'Playing'
          statusEl.className = 'status-badge badge text-bg-success'
        } else if (event.data === 0) {
          statusEl.textContent = 'Ended'
          statusEl.className = 'status-badge badge text-bg-secondary'
          if (btnPlayPause) btnPlayPause.textContent = '▶'
        } else if (event.data === 3) {
          statusEl.textContent = 'Buffering'
          statusEl.className = 'status-badge badge text-bg-info'
        } else if (event.data === 5) {
          statusEl.textContent = 'Ready'
          statusEl.className = 'status-badge badge text-bg-primary'
        } else {
          statusEl.textContent = 'Idle'
          statusEl.className = 'status-badge badge text-bg-secondary'
        }
      }
    }

    // a newly loaded video may start at 1x - put the chosen speed back
    if (event.data === 1 || event.data === 5) applySpeed()

    // Update button states when player state changes
    updateButtonStates()
    // buffering (3) keeps the current lock so a brief stall doesn't flip it
    if (event.data !== 3) updateOrientationLock(event.data === 1)
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
      const progressBar = document.getElementById('progressBar')
      if (frame) {
        if (frameClickHandlerRef.current) frame.removeEventListener('click', frameClickHandlerRef.current)
        if (frameTouchHandlerRef.current) frame.removeEventListener('touchstart', frameTouchHandlerRef.current)
      }
      if (container) {
        if (containerMouseMoveHandlerRef.current) container.removeEventListener('mousemove', containerMouseMoveHandlerRef.current)
      }
      if (controlsEl) {
        if (controlsPointerDownHandlerRef.current) controlsEl.removeEventListener('pointerdown', controlsPointerDownHandlerRef.current)
        if (controlsPointerUpHandlerRef.current) controlsEl.removeEventListener('pointerup', controlsPointerUpHandlerRef.current)
        controlsEl.classList.remove('visible')
      }
      if (progressBar) {
        if (progressInputHandlerRef.current) progressBar.removeEventListener('input', progressInputHandlerRef.current)
        if (progressChangeHandlerRef.current) progressBar.removeEventListener('change', progressChangeHandlerRef.current)
      }
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      if (seekIdleTimerRef.current) {
        window.clearTimeout(seekIdleTimerRef.current)
        seekIdleTimerRef.current = null
      }
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      if (orientationHandlerRef.current) {
        orientationMediaRef.current?.removeEventListener('change', orientationHandlerRef.current)
        orientationHandlerRef.current = null
      }
      if (viewportHandlerRef.current) {
        window.removeEventListener('resize', viewportHandlerRef.current)
        viewportHandlerRef.current = null
      }
      // never leave the page locked
      document.body.classList.remove('pseudo-fullscreen')
      document.body.style.top = ''
      controlsAttachedRef.current = false
    }
  }, [])

  return null
}
