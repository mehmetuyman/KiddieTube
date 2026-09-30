export {}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void
    YT: any
  }
}

declare global {
  const __APP_VERSION__: string
}
