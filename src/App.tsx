import React, { useEffect, useState } from 'react'
import VideoGrid from './components/VideoGrid'
import YouTubeWrapper from './components/YouTubeWrapper'
import InstallPrompt from './components/InstallPrompt'

type Video = { id: string; title: string; category: string }

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

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(`${base}videos.json`)
      .then(r => r.json())
      .then((data: Video[]) => {
        setVideos(data)
        if (data.length) {
          setActiveVideoId(data[0].id)
          // Update video info immediately for the first video
          setTimeout(() => {
            const titleEl = document.getElementById('videoTitle')
            const categoryEl = document.getElementById('videoCategory')
            if (titleEl) titleEl.textContent = data[0].title
            if (categoryEl) categoryEl.textContent = data[0].category
          }, 100)
        }
      })
      .catch(err => console.error('Failed to load videos', err))
  }, [])

  const categories = ['All', ...Array.from(new Set(videos.map((v: Video) => v.category)))]
  const filtered = activeCategory === 'All' ? videos : videos.filter((v: Video) => v.category === activeCategory)

  const getCategoryLabel = (cat: string) => {
    const emoji = CATEGORY_EMOJIS[cat] || '📺'
    // Show only emoji on mobile, emoji + short text on desktop
    const shortName = cat.split(' / ')[0] // Get Turkish part only
    return { emoji, shortName }
  }

  const handleVideoSelect = (id: string) => {
    setActiveVideoId(id)
    setShouldAutoPlay(true) // User explicitly clicked a video, auto-play it
    // Scroll to show full player at top
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 100)
  }

  return (
    <div className="app-container">
      {/* Simple header with logo */}
      <header className="app-header">
        <div 
          className="brand-clickable"
          onClick={() => window.location.reload()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.location.reload() }}
          aria-label="Reload app"
          title="Reload app"
        >
          <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Kiddie Tube" className="app-logo" />
          <span className="brand-title">Kiddie Tube</span>
        </div>
        <span className="version-badge">v2.0.0</span>
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

          <h1 className="video-title" id="videoTitle">Select a video to begin</h1>
          <div className="video-meta">
            <p className="video-category" id="videoCategory"></p>
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
      <YouTubeWrapper videoId={activeVideoId} videos={videos} autoPlay={shouldAutoPlay} />
    </div>
  )
}
