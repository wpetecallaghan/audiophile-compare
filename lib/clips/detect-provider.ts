// Describes everything we can know about a clip URL before any network request
export type DetectedClip = {
  provider: 'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'
  media_type: 'audio' | 'video' | 'unknown'
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

export function detectProvider(rawUrl: string): DetectedClip {
  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    // URL constructor throws if the string isn't a valid URL
    return {
      provider: 'unknown',
      media_type: 'unknown',
      embed_id: null,
      canonical_url: rawUrl,
    }
  }

  const youtubeId = extractYouTubeId(url)
  if (youtubeId) {
    return {
      provider: 'youtube',
      media_type: 'video',
      embed_id: youtubeId,
      canonical_url: `https://www.youtube.com/embed/${youtubeId}`,
    }
  }

  const vimeoId = extractVimeoId(url)
  if (vimeoId) {
    return {
      provider: 'vimeo',
      media_type: 'video',
      embed_id: vimeoId,
      canonical_url: `https://player.vimeo.com/video/${vimeoId}`,
    }
  }

  const googleDriveId = extractGoogleDriveId(url)
  if (googleDriveId) {
    return {
      provider: 'google-drive',
      // No reliable way to know audio vs video from the URL alone, but
      // real clips shared this way are virtually always video recordings
      // (e.g. filming a system playing back) — same 'video' default
      // already used for youtube/vimeo rather than 'unknown'.
      media_type: 'video',
      embed_id: googleDriveId,
      canonical_url: `https://drive.google.com/file/d/${googleDriveId}/preview`,
    }
  }

  // Anything else is treated as a direct URL — we'll HEAD it to learn more
  return {
    provider: 'direct',
    media_type: 'unknown',   // resolved by HEAD request below
    embed_id: null,
    canonical_url: rawUrl,
  }
}