// Shared Tailwind classes for the video-embed players (YouTube, Vimeo,
// Google Drive) — each wraps a provider iframe in the same aspect-ratio
// box for the same reason: without an explicit width/height, the iframe's
// own default sizing wins over a stretch-to-fill layout (see
// YouTubePlayer.tsx's comment, build step 55).
export const EMBED_WRAPPER_CLASSES = 'relative w-full max-w-full aspect-video overflow-hidden'
export const EMBED_FILL_CLASSES = 'absolute inset-0 w-full h-full'
