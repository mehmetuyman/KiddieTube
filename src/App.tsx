import React, { useEffect, useState } from 'react'
import VideoList from './components/VideoList'
import YouTubeWrapper from './components/YouTubeWrapper'
import InstallPrompt from './components/InstallPrompt'

type Video = { id: string; title: string; category: string }

export default function App() {
  const [videos, setVideos] = useState<Video[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)

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

  // When activeVideoId changes (including when set by category selection), focus the corresponding
  // video button so it gets the same visual affordance as a manual click.
  useEffect(() => {
    if (!activeVideoId) return
    const btn = document.querySelector<HTMLButtonElement>(`button[data-video-id="${activeVideoId}"]`)
    if (btn) {
      // focus for keyboard users and visual affordance
      btn.focus()
      // ensure the selected item is visible inside the scrollable list
      try {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      } catch (err) {
        // fallback: instant scroll
        btn.scrollIntoView()
      }
    }
  }, [activeVideoId])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.classList.add('drawer-open')
    } else {
      document.body.classList.remove('drawer-open')
    }
    return () => {
      document.body.classList.remove('drawer-open')
    }
  }, [drawerOpen])

  return (
    <div>
      <header className="bg-light border-bottom py-2 shadow-sm app-topbar">
        <div className="container-xl d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-2 app-brand">
            {/* Hamburger menu button - visible only on mobile */}
            <button 
              className="hamburger d-lg-none"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open categories menu"
            >
              <span className="hamburger-bar"></span>
              <span className="hamburger-bar"></span>
              <span className="hamburger-bar"></span>
            </button>
            
            {/* Logo and brand - clickable to reload app */}
            <div 
              className="d-flex align-items-center gap-2 brand-clickable"
              onClick={() => window.location.reload()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') window.location.reload() }}
              aria-label="Reload app"
              title="Reload app"
            >
              <img src={`${import.meta.env.BASE_URL}assets/logo.png`} alt="Kiddie Tube logo" className="app-logo" width={48} height={48} />
              <span className="brand-title text-primary">Kiddie Tube</span>
            </div>
            
            {/* Current category indicator on mobile */}
            <span className="d-lg-none text-muted small ms-2">• {activeCategory}</span>
          </div>
          <span className="text-muted small d-none d-md-inline">Handpicked videos for happy screen time</span>
        </div>
      </header>

      {/* Mobile category drawer */}
      <div className={`category-drawer ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)}>
        <div className="category-drawer-panel" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-header">
            <span>Categories</span>
            <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">×</button>
          </div>
          <div className="list-group list-group-flush" style={{ flex: 1, overflowY: 'auto' }}>
            {categories.map(cat => (
              <button
                key={cat}
                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center category-item ${
                  cat === activeCategory ? 'active' : ''
                }`}
                onClick={() => {
                  setActiveCategory(cat)
                  const filteredForCat = cat === 'All' ? videos : videos.filter((v: Video) => v.category === cat)
                  setActiveVideoId(filteredForCat.length ? filteredForCat[0].id : null)
                  setDrawerOpen(false) // Auto-close drawer after selection
                }}
              >
                <span>{cat}</span>
                <span className="badge rounded-pill">{cat === 'All' ? videos.length : videos.filter(v => v.category === cat).length}</span>
              </button>
            ))}
          </div>
          <div className="version-info">
            v1.0.0 © 2025
          </div>
        </div>
      </div>

      <main className="py-4">
        <div className="container-xl">
          <div className="row g-4 align-items-start">
            {/* Desktop category sidebar - hidden on mobile */}
            <aside className="col-lg-3 d-none d-lg-block">
              <div className="card shadow-sm h-100 category-card">
                <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
                  <span>Categories</span>
                </div>
                <div className="list-group list-group-flush" role="list">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center category-item ${
                        cat === activeCategory ? 'active' : ''
                      }`}
                      onClick={() => {
                        setActiveCategory(cat)
                        const filteredForCat = cat === 'All' ? videos : videos.filter((v: Video) => v.category === cat)
                        setActiveVideoId(filteredForCat.length ? filteredForCat[0].id : null)
                      }}
                    >
                      <span>{cat}</span>
                      <span className="badge rounded-pill">{cat === 'All' ? videos.length : videos.filter(v => v.category === cat).length}</span>
                    </button>
                  ))}
                </div>
                <div className="version-info">
                  v1.0.0 © 2025
                </div>
              </div>
            </aside>

            {/* Video player - sticky on mobile */}
            <section className="col-12 col-lg-6">
              <div className="player-sticky-wrapper">
                <div className="card shadow-sm mb-4 mb-lg-0">
                  <div className="card-body">
                    <div className="video-container">
                      <div className="ratio ratio-16x9 bg-black rounded overflow-hidden position-relative video-frame mb-3 fullscreen-reset">
                        <div id="videoPlayer" className="w-100 h-100"></div>
                        <div className="pause-shield" />
                        <div className="iframe-guard-full" />
                      </div>

                      <div className="custom-controls">
                        {/* These buttons will be wired by YouTubeWrapper through callbacks */}
                        <button id="btnPlay">▶</button>
                        <button id="btnPause">⏸</button>
                        <button id="btnMute">🔇</button>
                        <button id="btnUnmute">🔊</button>
                        <button id="btnFullscreen">⛶</button>
                        
                        {/* Line break to force time controls to new row in non-fullscreen */}
                        <div className="time-controls-break"></div>
                        
                        {/* Line break for fullscreen mode only */}
                        <div className="fullscreen-break"></div>
                        
                        {/* Exit pseudo-fullscreen button (visible only in pseudo-fullscreen mode on touch devices) */}
                        <button id="btnExitPseudoFs" className="exit-fullscreen-btn" aria-label="Exit fullscreen">✕</button>

                        <span id="currentTime">0:00</span>
                        <input type="range" id="progressBar" defaultValue={0} min={0} max={100} />
                        <span id="duration">0:00</span>
                      </div>

                      <h1 className="h4 mb-1" id="videoTitle">Select a video to begin</h1>
                      <p className="text-muted mb-2" id="videoCategory"></p>
                      <span className="badge text-bg-secondary" id="videoStatus">Idle</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Video list - scrollable on all screen sizes */}
            <aside className="col-12 col-lg-3">
              <div className="card h-100 shadow-sm video-list-card">
                <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                  <strong id="listHeading">{activeCategory} Videos</strong>
                  <span className="badge bg-light text-primary">{filtered.length}</span>
                </div>
                <div id="videoList" className="list-group list-group-flush" role="list">
                  <VideoList
                    videos={filtered}
                    activeVideoId={activeVideoId}
                    onSelect={id => setActiveVideoId(id)}
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <InstallPrompt onClose={() => {}} />
      <YouTubeWrapper videoId={activeVideoId} videos={videos} />
    </div>
  )
}
