import React, { useEffect, useRef, useState } from 'react'
import VideoGrid from './components/VideoGrid'
import YouTubeWrapper from './components/YouTubeWrapper'
import InstallPrompt from './components/InstallPrompt'
import ParentPanel, { requestParentAccess } from './components/ParentPanel'
import { Video, loadVideos, LoadSource } from './lib/videoStore'

// Category emoji mapping
const CATEGORY_EMOJIS: Record<string, string> = {
  'All': '🎬',
  'Eğitim / Education': '🎓',
  'İslami İçerikler / Islamic Content': '🕌',
  'Tarım ve Bahçe / Agriculture & Gardening': '🌱',
  'Çocuk Şarkıları / Kids Songs': '🎵',
  'Su Sistemleri / Water Systems': '💧',
  'Çocuk Çizgi Film / Kids Cartoons': '🎬',
  'Gıda ve El İşi / Food & DIY': '🍴',
  'Sağlık ve Günlük Bilgiler / Health & Everyday Tips': '💊'
}

export default function App() {
  const [videos, setVideos] = useState<Video[]>([])
  const [activeCategory, setActiveCategory] = useState('All')
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false)
  // bumped on every explicit tap so re-tapping the current video replays it
  const [playRequest, setPlayRequest] = useState(0)
  const [parentOpen, setParentOpen] = useState(false)

  // long-press detection on the logo -> opens the (hidden) parent panel
  const lpTimer = useRef<number | null>(null)
  const lpFired = useRef(false)
  const parentParamHandled = useRef(false)
  const activeVideoIdRef = useRef<string | null>(null)
  activeVideoIdRef.current = activeVideoId

  const applyList = (list: Video[]) => {
    setVideos(list)
    if (!activeVideoIdRef.current || !list.some(v => v.id === activeVideoIdRef.current)) {
      // the current video went away (e.g. deleted in the parent panel): cue the
      // replacement instead of auto-playing it behind the panel
      setShouldAutoPlay(false)
      setActiveVideoId(list[0]?.id ?? null)
    }
    // a category can disappear when its last video is removed
    setActiveCategory(cat => (cat === 'All' || list.some(v => v.category === cat) ? cat : 'All'))
  }

  useEffect(() => {
    loadVideos()
      .then(({ doc }) => applyList(doc.videos))
      .catch(err => console.error('Failed to load videos', err))
  }, [])

  useEffect(() => {
    if (parentParamHandled.current) return
    parentParamHandled.current = true
    const params = new URLSearchParams(window.location.search)
    if (params.get('parent') === '1') openParent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reloadFromCloud = async (): Promise<LoadSource> => {
    const { doc, source } = await loadVideos()
    applyList(doc.videos)
    return source
  }

  const categories = ['All', ...Array.from(new Set(videos.map((v: Video) => v.category)))]
  const filtered = activeCategory === 'All' ? videos : videos.filter((v: Video) => v.category === activeCategory)
  const activeVideo = videos.find(v => v.id === activeVideoId) ?? null

  const getCategoryLabel = (cat: string) => {
    const emoji = CATEGORY_EMOJIS[cat] || '📺'
    // Show only emoji on mobile, emoji + short text on desktop
    const shortName = cat.split(' / ')[0] // Get Turkish part only
    return { emoji, shortName }
  }

  const handleVideoSelect = (id: string) => {
    setActiveVideoId(id)
    setShouldAutoPlay(true) // User explicitly clicked a video, auto-play it
    setPlayRequest(n => n + 1)
    // Scroll to show full player at top
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 100)
  }

  function openParent() {
    if (!requestParentAccess()) return
    setParentOpen(true)
  }

  // --- long-press on the logo ---
  const startLongPress = () => {
    lpFired.current = false
    lpTimer.current = window.setTimeout(() => {
      lpFired.current = true
      if (navigator.vibrate) navigator.vibrate(30)
      openParent()
    }, 700)
  }
  const cancelLongPress = () => {
    if (lpTimer.current) {
      window.clearTimeout(lpTimer.current)
      lpTimer.current = null
    }
  }
  const handleBrandActivate = () => {
    if (lpFired.current) {
      lpFired.current = false
      return // long-press already handled -> don't reload
    }
    window.location.reload()
  }

  return (
    <div className="app-container">
      {/* Simple header with logo */}
      <header className="app-header">
        <div
          className="brand-clickable"
          onClick={handleBrandActivate}
          onPointerDown={startLongPress}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          role="button"
          tabIndex={0}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.location.reload() }}
          aria-label="Reload app"
          title="Reload app"
        >
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Kiddie Tube" className="app-logo" draggable={false} />
          <span className="brand-title">Kiddie Tube</span>
        </div>
        <span className="version-badge">v{__APP_VERSION__}</span>
      </header>

      {/* Horizontal scrolling category pills */}
      <div className="category-pills-container">
        <div className="category-pills">
          {categories.map(cat => {
            const { emoji, shortName } = getCategoryLabel(cat)
            return (
              <button
                key={cat}
                className={`category-pill ${cat === activeCategory ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(cat)
                  const filteredForCat = cat === 'All' ? videos : videos.filter((v: Video) => v.category === cat)
                  setActiveVideoId(filteredForCat.length ? filteredForCat[0].id : null)
                  setShouldAutoPlay(false) // Don't auto-play on category change
                }}
              >
                <span className="category-emoji">{emoji}</span>
                <span className="category-name">{shortName}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Video player - sticky on mobile */}
      <section className="player-section">
        <div className="video-container">
          <div className="video-frame">
            <div id="videoPlayer" className="w-100 h-100"></div>
            <div className="pause-shield" />
            <div className="iframe-guard-full" />
          </div>

          {/* Minimize button - positioned at top-right in fullscreen */}
          <button id="btnExitPseudoFs" className="control-btn-topright exit-fullscreen" aria-label="Exit fullscreen">⛶</button>

          <div className="custom-controls">
            {/* Bottom center: Play/Pause, skip buttons, timeline, and fullscreen button */}
            <div className="controls-bottom">
              <button id="btnSkipBack" className="control-btn-skip" title="Back 10s">
                <span className="skip-icon">↶<sub>10</sub></span>
              </button>
              <button id="btnPlayPause" className="control-btn-play">▶</button>
              <button id="btnSkipForward" className="control-btn-skip" title="Forward 10s">
                <span className="skip-icon">↷<sub>10</sub></span>
              </button>
              <span id="currentTime" className="time-display">0:00</span>
              <input type="range" id="progressBar" className="progress-slider" defaultValue={0} min={0} max={100} />
              <span id="duration" className="time-display">0:00</span>
              <button id="btnFullscreen" className="control-btn-fullscreen">⛶</button>
            </div>
          </div>

          <h1 className="video-title" id="videoTitle">{activeVideo ? activeVideo.title : 'Select a video to begin'}</h1>
          <div className="video-meta">
            <p className="video-category" id="videoCategory">{activeVideo?.category ?? ''}</p>
            <span className="status-badge" id="videoStatus">Idle</span>
          </div>
        </div>
      </section>

      {/* Video grid */}
      <section className="video-grid-section">
        <div className="grid-header">
          <span className="grid-title">{activeCategory === 'All' ? 'All Videos' : getCategoryLabel(activeCategory).shortName}</span>
          <span className="grid-count">{filtered.length} videos</span>
        </div>
        <VideoGrid
          videos={filtered}
          activeVideoId={activeVideoId}
          onSelect={handleVideoSelect}
        />
      </section>

      <InstallPrompt onClose={() => {}} />
      <YouTubeWrapper videoId={activeVideoId} autoPlay={shouldAutoPlay} playRequest={playRequest} />

      <ParentPanel
        open={parentOpen}
        onClose={() => setParentOpen(false)}
        videos={videos}
        onVideosChange={applyList}
        onRefresh={reloadFromCloud}
      />
    </div>
  )
}
