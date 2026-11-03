// Video title/channel lookup via YouTube's public oEmbed endpoint (no API key).
// Done server-side so the result is consistent for every family member and
// so a video that isn't embeddable/public is caught when it's added.

export interface YouTubeMeta {
  title: string
  channel: string
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export async function fetchYouTubeMeta(
  youtubeId: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = 5000,
): Promise<YouTubeMeta | null> {
  const target = encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)
  try {
    const res = await fetchImpl(`https://www.youtube.com/oembed?url=${target}&format=json`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null // 401/403: not embeddable, 404: private/deleted
    const data = (await res.json()) as { title?: unknown; author_name?: unknown }
    return {
      title: typeof data.title === 'string' ? data.title : '',
      channel: typeof data.author_name === 'string' ? data.author_name : '',
    }
  } catch {
    return null
  }
}
