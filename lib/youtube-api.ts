// Tracks whether we've already injected the script tag
let apiLoaded = false
// Tracks callbacks waiting for the API to be ready
let readyCallbacks: Array<() => void> = []

export function loadYouTubeApi(onReady: () => void): void {
  // If the YT global already exists, the API is ready — call immediately
  if (window.YT?.Player) {
    onReady()
    return
  }

  // Queue the callback — will be flushed when the API fires its ready event
  readyCallbacks.push(onReady)

  if (apiLoaded) return   // script already injected, just wait

  apiLoaded = true

  // The YouTube API calls window.onYouTubeIframeAPIReady when it's loaded.
  // We wrap it to flush our queue, preserving any existing handler.
  const existing = window.onYouTubeIframeAPIReady
  window.onYouTubeIframeAPIReady = () => {
    existing?.()
    readyCallbacks.forEach(cb => cb())
    readyCallbacks = []
  }

  const script = document.createElement('script')
  script.src = 'https://www.youtube.com/iframe_api'
  document.head.appendChild(script)
}