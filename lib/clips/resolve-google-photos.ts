// Google Photos share links (https://photos.app.goo.gl/... or the resolved
// https://photos.google.com/share/...) can never be iframe-embedded — Google
// sends X-Frame-Options: SAMEORIGIN on both the short-link redirect and the
// resolved share page (verified live), unlike Google Drive's /file/d/{id}/preview
// which has no such header (see detect-provider.ts's google-drive handling).
//
// But the share page's HTML carries Open Graph tags for link-preview purposes
// (Twitter/Facebook/Discord unfurling), and og:video/og:video:secure_url point
// at a lh3.googleusercontent.com/pw/... CDN URL that redirects to a real,
// directly-playable video/mp4 stream. Frame restrictions don't apply to a
// <video src> the way they do to an iframe, so that resolved URL can be used
// exactly like a Dropbox raw=1 link (see detect-provider.ts) — no custom
// player component needed, just NativePlayer's existing plain <video> tag.
//
// Known limitations, accepted rather than fixed:
// - Quality is capped to a fixed transcoded preview (~360p, itag 18)
//   regardless of requested size — not the original upload. Comparable in
//   kind to GoogleDrivePlayer's documented "always crops to fill its box".
// - Only a single-item share (one photo/video) is handled — a multi-item
//   album share's OG tags describe just one representative item, not
//   necessarily the one intended; out of scope for this app's
//   one-clip-one-recording model.
// - A photo-only share has no og:video tag at all — resolves to null,
//   same as any other failure.
//
// This requires a real network fetch + HTML scrape, so unlike every other
// provider in detect-provider.ts it cannot be pure/synchronous — kept in its
// own module for that reason, called only from the one place that's already
// async (to-clip-data.ts).
//
// IMPORTANT: the resolved lh3.googleusercontent.com URL is never used
// directly as a <video src> — it redirects cross-origin to a different host
// (googlevideo.com), and Chromium's Opaque Response Blocking (ORB) blocks a
// plain <video> element from following that cross-origin redirect chain
// (confirmed live: reproduces from any real HTTP origin, unrelated to
// referrer policy or this app's own headers; never reproduces from a
// same-origin request). `app/api/clips/google-photos-proxy/route.ts`
// streams the bytes through our own server instead, sidestepping ORB
// entirely — `to-clip-data.ts` points canonical_url at that proxy route,
// not at this module's resolved URL directly.

const GOOGLE_PHOTOS_SHORT_HOSTNAME = 'photos.app.goo.gl'
const GOOGLE_PHOTOS_HOSTNAME = 'photos.google.com'
const GOOGLE_PHOTOS_SHARE_PATH_PREFIX = '/share/'

// The CDN host og:video/og:video:secure_url resolve to. Exported so the
// proxy route can validate against the same allowlist rather than
// duplicating the literal — it must only ever forward requests to Google's
// own CDN, never act as an open arbitrary-URL proxy (SSRF mitigation, same
// pattern as Next.js's own /_next/image domain allowlist).
export const GOOGLE_PHOTOS_CDN_HOSTNAME = 'lh3.googleusercontent.com'

// Deliberately not a bot-identifying UA like check-url.ts's
// AudiophileCompare-URLHealthCheck string — the OG tags were only observed
// with a browser UA during testing; a self-identifying UA risks a stripped
// JS-shell response with no OG tags at all, silently breaking this in
// production while curl-testing with a browser UA keeps passing. Exported
// for the proxy route to reuse — Google's CDN was observed rate-limiting
// requests that look bot-like, so both hops should look like the same
// ordinary browser request.
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export function isGooglePhotosUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (url.hostname === GOOGLE_PHOTOS_SHORT_HOSTNAME) return true
  return url.hostname === GOOGLE_PHOTOS_HOSTNAME && url.pathname.startsWith(GOOGLE_PHOTOS_SHARE_PATH_PREFIX)
}

// Matches the whole <meta ...> tag first (attribute order varies), then
// pulls content="..." out of that matched substring — avoids a single regex
// that assumes property= always comes before content=.
function extractOgTagContent(html: string, property: string): string | null {
  const tagPattern = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*>`, 'i')
  const tagMatch = html.match(tagPattern)
  if (!tagMatch) return null

  const contentMatch = tagMatch[0].match(/content=["']([^"']*)["']/i)
  if (!contentMatch) return null

  return contentMatch[1].replace(/&amp;/g, '&')
}

export async function resolveGooglePhotosVideoUrl(
  url: string,
  timeoutMs = 3000
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_USER_AGENT },
      // The resolved video URL is stable across requests (each request gets
      // a freshly-signed redirect from Google, verified live) — caching the
      // scrape avoids re-hitting Google's servers on every single page view.
      next: { revalidate: 3600 },
    })

    if (!response.ok) return null

    const html = await response.text()
    const videoUrl =
      extractOgTagContent(html, 'og:video:secure_url') ?? extractOgTagContent(html, 'og:video')
    if (!videoUrl) return null

    // Defensive check — only ever return a URL on the expected CDN host, so
    // callers (the proxy route's allowlist) never receive something that's
    // guaranteed to be rejected downstream.
    try {
      if (new URL(videoUrl).hostname !== GOOGLE_PHOTOS_CDN_HOSTNAME) return null
    } catch {
      return null
    }

    return videoUrl
  } catch {
    // Timeout (AbortError), network error, or DNS failure — absence just
    // means no resolution, not a broken scrape (same philosophy as
    // lib/ingestion/scrape/fetch-oembed.ts).
    return null
  } finally {
    clearTimeout(timer)
  }
}
