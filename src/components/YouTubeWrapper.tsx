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

type Props = { videoId: string | null }

export default function YouTubeWrapper({ videoId }: Props) {
  const playerRef = useRef<any>(null)
  const playerReadyRef = useRef(false)
  const pendingRef = useRef<string | null>(null)

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
    } else {
      pendingRef.current = videoId
    }
  }, [videoId])

  function attachControls() {
    const btnPlay = document.getElementById('btnPlay')
    const btnPause = document.getElementById('btnPause')
    const btnMute = document.getElementById('btnMute')
    const btnUnmute = document.getElementById('btnUnmute')
    const btnFullscreen = document.getElementById('btnFullscreen')
    const progressBar = document.getElementById('progressBar') as HTMLInputElement | null
    const currentTimeEl = document.getElementById('currentTime')
    const durationEl = document.getElementById('duration')

    if (btnPlay) btnPlay.onclick = () => playerRef.current?.playVideo()
    if (btnPause) btnPause.onclick = () => playerRef.current?.pauseVideo()
    if (btnMute) btnMute.onclick = () => playerRef.current?.mute()
    if (btnUnmute) btnUnmute.onclick = () => playerRef.current?.unMute()
    if (btnFullscreen) btnFullscreen.onclick = () => {
      // Request fullscreen on the outer container so overlays (pause-shield / guards / controls)
      // remain active and can intercept touches/clicks while in fullscreen.
      const container = document.querySelector('.video-container') as HTMLElement | null
      const iframe = playerRef.current.getIframe()
      // ensure iframe allows fullscreen
      if (iframe && !iframe.hasAttribute('allowfullscreen')) {
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
      }

      const target = container || iframe
      if (target.requestFullscreen) target.requestFullscreen()
      else if ((target as any).webkitRequestFullscreen) (target as any).webkitRequestFullscreen()
      else if ((target as any).msRequestFullscreen) (target as any).msRequestFullscreen()
    }

    setInterval(() => {
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

    function formatTime(sec: number) {
      const minutes = Math.floor(sec / 60)
      const seconds = Math.floor(sec % 60)
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
    }
  }

  function handleStateChange(event: any) {
    const pauseShield = document.querySelector('.pause-shield')
    if (event.data === 2) pauseShield?.classList.add('visible')
    else pauseShield?.classList.remove('visible')
  }

  return null
}
