export {}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void
    YT: any
  }
}
