import React, { useState } from 'react'
import { Video } from '../lib/videoStore'

type Props = {
  videos: Video[]
  activeVideoId: string | null
  onSelect: (id: string) => void
}

export default function VideoGrid({ videos, activeVideoId, onSelect }: Props) {
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set())

  // hqdefault (480x360) exists for every video and is plenty for a grid card;
  // maxresdefault is ~1280x720, often missing, and heavy on mobile data.
  const getThumbnailUrl = (videoId: string) => {
    if (failedThumbnails.has(videoId)) {
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    }
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
  }

  const handleThumbnailError = (videoId: string) => {
    // only fall back once, so a missing fallback can't loop
    setFailedThumbnails(prev => (prev.has(videoId) ? prev : new Set(prev).add(videoId)))
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
