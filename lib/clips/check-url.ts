import type { DetectedClip, MediaType } from './detect-provider'
import { isDropboxUrl } from './detect-provider'

export type UrlStatus = 'ok' | 'degraded' | 'dead'

export type UrlCheckResult = {
  url_status: UrlStatus
  media_type: MediaType
  duration_ms: null   // not derivable from a HEAD request; null until playback
}

// Identifies this health-checker to whatever's on the other end — standard
// etiquette for automated traffic, and avoids the "no User-Agent at all"
// fingerprint that some hosts' bot-mitigation (e.g. Cloudflare) specifically
// challenges, while ordinary browser traffic sails through unaffected.
const USER_AGENT = 'AudiophileCompare-URLHealthCheck/1.0 (+https://audiophile-compare.uk)'

export const STATUS_OK: UrlStatus = 'ok'
export const STATUS_DEGRADED: UrlStatus = 'degraded'
export const STATUS_DEAD: UrlStatus = 'dead'
const MEDIA_TYPE_UNKNOWN = 'unknown'

// Maps Content-Type header values to our media_type enum
function resolveMediaType(contentType: string | null): MediaType {
  if (!contentType) return MEDIA_TYPE_UNKNOWN
  if (contentType.startsWith('audio/')) return 'audio'
  if (contentType.startsWith('video/')) return 'video'
  return MEDIA_TYPE_UNKNOWN
}

// A genuinely reachable Dropbox raw=1 link always 302s off dropbox.com to
// a *.dl.dropboxusercontent.com CDN host before serving 200; a broken one
// (wrong/expired rlkey, deleted file) still returns 200, but straight from
// dropbox.com itself — the ordinary web-app shell, never actually
// redirected. Verified live against 10 distinct real clips (build-history/59).
function isDropboxUsercontentHost(finalUrl: string): boolean {
  try {
    return new URL(finalUrl).hostname.endsWith('dropboxusercontent.com')
  } catch {
    return false
  }
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
      headers: { 'User-Agent': USER_AGENT },
    })

    clearTimeout(timer)

    const contentType = response.headers.get('content-type')

    if (response.ok) {
      // Content-type can't distinguish a broken Dropbox link from a
      // working one here — Dropbox's CDN misreports even a real video as
      // application/json — so a Dropbox URL that got a 200 without ever
      // leaving dropbox.com is treated as dead instead. Gated to Dropbox
      // only: this says nothing about any other direct host's 200.
      if (isDropboxUrl(new URL(clip.canonical_url)) && !isDropboxUsercontentHost(response.url)) {
        return {
          url_status: STATUS_DEAD,
          media_type: MEDIA_TYPE_UNKNOWN,
          duration_ms: null,
        }
      }

      return {
        url_status: STATUS_OK,
        media_type: resolveMediaType(contentType),
        duration_ms: null,
      }
    }

    // 4xx = dead (resource gone or forbidden); 5xx = degraded (server error, may recover)
    return {
      url_status: response.status >= 500 ? STATUS_DEGRADED : STATUS_DEAD,
      media_type: MEDIA_TYPE_UNKNOWN,
      duration_ms: null,
    }
  } catch (err) {
    clearTimeout(timer)

    // AbortError means we hit the timeout
    if (err instanceof Error && err.name === 'AbortError') {
      return { url_status: STATUS_DEGRADED, media_type: MEDIA_TYPE_UNKNOWN, duration_ms: null }
    }

    // Network error — DNS failure, connection refused, etc.
    return { url_status: STATUS_DEAD, media_type: MEDIA_TYPE_UNKNOWN, duration_ms: null }
  }
}