import React, { useState } from 'react'

type Video = { id: string; title: string; category: string }

type Props = {
  videos: Video[]
  activeVideoId: string | null
  onSelect: (id: string) => void
}

export default function VideoGrid({ videos, activeVideoId, onSelect }: Props) {
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set())

  const getThumbnailUrl = (videoId: string, useHq: boolean = false) => {
    if (useHq || failedThumbnails.has(videoId)) {
      return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    }
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  }

  const handleThumbnailError = (videoId: string) => {
    setFailedThumbnails(prev => new Set(prev).add(videoId))
  }

  return (
    <div className="video-grid">
      {videos.map(video => (
        <div
          key={video.id}
          className={`video-card ${video.id === activeVideoId ? 'active' : ''}`}
          onClick={() => onSelect(video.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(video.id) }}
        >
          <div className="video-thumbnail-wrapper">
            <img
              src={getThumbnailUrl(video.id)}
              alt={video.title}
              className="video-thumbnail"
              onError={() => handleThumbnailError(video.id)}
              loading="lazy"
            />
            {video.id === activeVideoId && (
              <div className="playing-indicator">
                <span className="playing-pulse"></span>
                ▶ Playing
              </div>
            )}
          </div>
          <div className="video-card-title">{video.title}</div>
        </div>
      ))}
    </div>
  )
}
