import type { DetectedClip } from './detect-provider'

export type UrlCheckResult = {
  url_status: 'ok' | 'degraded' | 'dead'
  media_type: 'audio' | 'video' | 'unknown'
  duration_ms: null   // not derivable from a HEAD request; null until playback
}

// Maps Content-Type header values to our media_type enum
function resolveMediaType(contentType: string | null): 'audio' | 'video' | 'unknown' {
  if (!contentType) return 'unknown'
  if (contentType.startsWith('audio/')) return 'audio'
  if (contentType.startsWith('video/')) return 'video'
  return 'unknown'
}

export async function checkDirectUrl(
  clip: DetectedClip,
  timeoutMs = 5000
): Promise<UrlCheckResult> {
  // AbortController lets us cancel the fetch if it takes too long.
  // This is the standard JS pattern — equivalent to a CancellationToken in .NET.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(clip.canonical_url, {
      method: 'HEAD',
      signal: controller.signal,
    })

    clearTimeout(timer)

    const contentType = response.headers.get('content-type')

    if (response.ok) {
      return {
        url_status: 'ok',
        media_type: resolveMediaType(contentType),
        duration_ms: null,
      }
    }

    // 4xx = dead (resource gone or forbidden); 5xx = degraded (server error, may recover)
    return {
      url_status: response.status >= 500 ? 'degraded' : 'dead',
      media_type: 'unknown',
      duration_ms: null,
    }
  } catch (err) {
    clearTimeout(timer)

    // AbortError means we hit the timeout
    if (err instanceof Error && err.name === 'AbortError') {
      return { url_status: 'degraded', media_type: 'unknown', duration_ms: null }
    }

    // Network error — DNS failure, connection refused, etc.
    return { url_status: 'dead', media_type: 'unknown', duration_ms: null }
  }
}