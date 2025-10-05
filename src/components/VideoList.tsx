import React from 'react'

type Video = { id: string; title: string; category: string }

export default function VideoList({ videos, activeVideoId, onSelect }:
  { videos: Video[]; activeVideoId: string | null; onSelect: (id: string) => void }) {
  return (
    <>
      {videos.map(video => (
        <button
          key={video.id}
          type="button"
          className={`list-group-item list-group-item-action d-flex flex-column align-items-start gap-1 ${
            video.id === activeVideoId ? 'active-video' : ''
          }`}
          onClick={() => onSelect(video.id)}
        >
          <span className="video-title">{video.title}</span>
          <span className="video-category">{video.category}</span>
        </button>
      ))}
    </>
  )
}
