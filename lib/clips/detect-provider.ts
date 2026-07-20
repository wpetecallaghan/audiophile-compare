// Canonical source for these two literal unions — every other file that
// needs a clip's provider/media_type imports them from here rather than
// redeclaring the same values.
export type ClipProvider = 'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'
export type MediaType = 'audio' | 'video' | 'unknown'

// One named constant per member, imported everywhere instead of repeating
// the raw string (mirrors check-url.ts's STATUS_OK/STATUS_DEGRADED/
// STATUS_DEAD for UrlStatus). `as const` rather than an explicit
// `: ClipProvider =` / `: MediaType =` annotation deliberately keeps each
// constant's own type as its narrow literal, not the wider union — some
// consumers (e.g. NativePlayer.tsx's own `'audio' | 'video'` prop type,
// narrower than the full MediaType) need the literal type to still be
// assignable there; a `MediaType`-typed constant would not be.
export const PROVIDER_YOUTUBE = 'youtube' as const
export const PROVIDER_VIMEO = 'vimeo' as const
export const PROVIDER_GOOGLE_DRIVE = 'google-drive' as const
export const PROVIDER_DIRECT = 'direct' as const
export const PROVIDER_UNKNOWN = 'unknown' as const

export const MEDIA_TYPE_AUDIO = 'audio' as const
export const MEDIA_TYPE_VIDEO = 'video' as const
export const MEDIA_TYPE_UNKNOWN = 'unknown' as const

// Describes everything we can know about a clip URL before any network request
export type DetectedClip = {
  provider: ClipProvider
  media_type: MediaType
  embed_id: string | null   // YouTube video ID, Vimeo video ID, or Drive file ID; null for direct/unknown
  canonical_url: string     // normalised URL suitable for the iframe src
}

// YouTube URLs come in several shapes:
//   https://www.youtube.com/watch?v=dQw4w9WgXcQ
//   https://youtu.be/dQw4w9WgXcQ
//   https://www.youtube.com/embed/dQw4w9WgXcQ  (already an embed URL)
function extractYouTubeId(url: URL): string | null {
  if (url.hostname === 'youtu.be') {
    return url.pathname.slice(1) || null
  }
  if (url.hostname.includes('youtube.com')) {
    if (url.pathname.startsWith('/embed/')) {
      return url.pathname.split('/embed/')[1] || null
    }
    return url.searchParams.get('v')
  }
  return null
}

// Vimeo URLs:
//   https://vimeo.com/123456789
//   https://player.vimeo.com/video/123456789  (already an embed URL)
function extractVimeoId(url: URL): string | null {
  if (url.hostname.includes('vimeo.com')) {
    const match = url.pathname.match(/\/(?:video\/)?(\d+)/)
    return match?.[1] ?? null   // ?. is optional chaining — safe access on possibly-null value
  }
  return null
}

// Google Drive file share URLs:
//   https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/view?usp=sharing
//   https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/preview  (already an embed URL)
// Deliberately does NOT match /drive/folders/... (a folder, not a single
// playable file) — only the /file/d/{id} shape.
function extractGoogleDriveId(url: URL): string | null {
  if (!url.hostname.includes('drive.google.com')) return null
  const match = url.pathname.match(/\/file\/d\/([^/]+)/)
  return match?.[1] ?? null
}

// Dropbox share URLs (e.g.
// https://www.dropbox.com/scl/fi/<id>/<filename>?rlkey=...&dl=0) serve an
// HTML share page by default — dl=0/dl=1 both do — which <audio>/<video>
// can never play. Swapping the dl param for raw=1 makes Dropbox serve the
// actual file bytes directly instead, confirmed live against a real file
// (build step 56): dl=0 fails instantly with a real <video> element,
// raw=1 plays it with correct duration/dimensions and no error. No SDK or
// iframe needed — matched by hostname only (not a specific path shape,
// unlike Drive's file-vs-folder distinction) since the rewrite is a safe
// no-op for any Dropbox URL that isn't actually a file link.
export function isDropboxUrl(url: URL): boolean {
  return url.hostname === 'www.dropbox.com' || url.hostname === 'dropbox.com'
}

function toDropboxRawUrl(url: URL): string {
  const rewritten = new URL(url.toString())
  rewritten.searchParams.delete('dl')   // whatever dl=0/dl=1 was there
  rewritten.searchParams.set('raw', '1')
  return rewritten.toString()           // rlkey and every other param untouched
}

export function detectProvider(rawUrl: string): DetectedClip {
  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    // URL constructor throws if the string isn't a valid URL
    return {
      provider: PROVIDER_UNKNOWN,
      media_type: MEDIA_TYPE_UNKNOWN,
      embed_id: null,
      canonical_url: rawUrl,
    }
  }

  const youtubeId = extractYouTubeId(url)
  if (youtubeId) {
    return {
      provider: PROVIDER_YOUTUBE,
      media_type: MEDIA_TYPE_VIDEO,
      embed_id: youtubeId,
      canonical_url: `https://www.youtube.com/embed/${youtubeId}`,
    }
  }

  const vimeoId = extractVimeoId(url)
  if (vimeoId) {
    return {
      provider: PROVIDER_VIMEO,
      media_type: MEDIA_TYPE_VIDEO,
      embed_id: vimeoId,
      canonical_url: `https://player.vimeo.com/video/${vimeoId}`,
    }
  }

  const googleDriveId = extractGoogleDriveId(url)
  if (googleDriveId) {
    return {
      provider: PROVIDER_GOOGLE_DRIVE,
      // No reliable way to know audio vs video from the URL alone, but
      // real clips shared this way are virtually always video recordings
      // (e.g. filming a system playing back) — same 'video' default
      // already used for youtube/vimeo rather than 'unknown'.
      media_type: MEDIA_TYPE_VIDEO,
      embed_id: googleDriveId,
      canonical_url: `https://drive.google.com/file/d/${googleDriveId}/preview`,
    }
  }

  if (isDropboxUrl(url)) {
    return {
      provider: PROVIDER_DIRECT,
      media_type: MEDIA_TYPE_UNKNOWN,   // HEAD misreports Content-Type even for raw=1 — resolved client-side (step 54)
      embed_id: null,
      canonical_url: toDropboxRawUrl(url),
    }
  }

  // Anything else is treated as a direct URL — we'll HEAD it to learn more
  return {
    provider: PROVIDER_DIRECT,
    media_type: MEDIA_TYPE_UNKNOWN,   // resolved by HEAD request below
    embed_id: null,
    canonical_url: rawUrl,
  }
}