import React, { useEffect, useState } from 'react'
import VideoList from './components/VideoList'
import YouTubeWrapper from './components/YouTubeWrapper'

type Video = { id: string; title: string; category: string }

export default function App() {
  const [videos, setVideos] = useState<Video[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/videos.json')
      .then(r => r.json())
      .then((data: Video[]) => {
        setVideos(data)
        if (data.length) setActiveVideoId(data[0].id)
      })
      .catch(err => console.error('Failed to load videos', err))
  }, [])

  const categories = ['All', ...Array.from(new Set(videos.map(v => v.category)))]

  const filtered = activeCategory === 'All' ? videos : videos.filter(v => v.category === activeCategory)

  return (
    <div>
      <header className="bg-light border-bottom py-2 shadow-sm">
        <div className="container-xl d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-2 app-brand">
            <img src="/assets/logo.png" alt="Kiddie Tube logo" className="app-logo" width={48} height={48} />
            <span className="brand-title text-primary">Kiddie Tube</span>
          </div>
          <span className="text-muted small">Handpicked videos for happy screen time</span>
        </div>
      </header>

      <main className="py-4">
        <div className="container-xl">
          <div className="row g-4 align-items-start">
            <aside className="col-12 col-lg-3">
              <div className="card shadow-sm h-100 category-card">
                <div className="card-header bg-primary text-white d-flex align-items-center justify-content-between">
                  <span>Categories</span>
                </div>
                <div className="d-lg-block">
                  <div className="list-group list-group-flush" role="list">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center category-item ${
                          cat === activeCategory ? 'active' : ''
                        }`}
                        onClick={() => setActiveCategory(cat)}
                      >
                        <span>{cat}</span>
                        <span className="badge rounded-pill">{cat === 'All' ? videos.length : videos.filter(v => v.category === cat).length}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <section className="col-12 col-lg-6">
              <div className="card shadow-sm mb-4 mb-lg-0">
                <div className="card-body">
                  <div className="ratio ratio-16x9 bg-black rounded overflow-hidden position-relative video-frame mb-3">
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

                    <span id="currentTime">0:00</span>
                    <input type="range" id="progressBar" defaultValue={0} min={0} max={100} />
                    <span id="duration">0:00</span>
                  </div>

                  <h1 className="h4 mb-1" id="videoTitle">Select a video to begin</h1>
                  <p className="text-muted mb-2" id="videoCategory"></p>
                  <span className="badge text-bg-secondary" id="videoStatus">Idle</span>
                </div>
              </div>
            </section>

            <aside className="col-12 col-lg-3">
              <div className="card h-100 shadow-sm">
                <div className="card-header bg-primary text-white">
                  <strong id="listHeading">All Videos</strong>
                </div>
                <div className="list-group list-group-flush" role="list">
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

      <YouTubeWrapper videoId={activeVideoId} />
    </div>
  )
}
