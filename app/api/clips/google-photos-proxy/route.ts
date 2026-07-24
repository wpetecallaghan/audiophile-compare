import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { GOOGLE_PHOTOS_CDN_HOSTNAME, BROWSER_USER_AGENT } from '@/lib/clips/resolve-google-photos'
import { HTTP_BAD_GATEWAY, HTTP_BAD_REQUEST } from '@/lib/api/http-status'

const UPSTREAM_FETCH_FAILED = 'Upstream fetch failed'

// GET /api/clips/google-photos-proxy?url=<lh3.googleusercontent.com URL>
//
// Google Photos' resolved video CDN URL (lh3.googleusercontent.com) redirects
// cross-origin to a different host (googlevideo.com) to actually serve the
// bytes. Chromium's Opaque Response Blocking (ORB) blocks a plain
// <video src> from following that cross-origin redirect chain directly —
// confirmed live: reproduces from any real HTTP origin (not specific to this
// app or its headers), never from a same-origin request. Streaming the bytes
// through our own server sidesteps ORB entirely, since the browser never
// makes the cross-origin request at all — see resolve-google-photos.ts.
//
// Only ever proxies to GOOGLE_PHOTOS_CDN_HOSTNAME, validated below — an
// allowlisted-host proxy, not an open arbitrary-URL one (SSRF mitigation,
// same pattern as Next.js's own /_next/image domain allowlist).
export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('url')
  if (!target) {
    return NextResponse.json({ error: 'url is required' }, { status: HTTP_BAD_REQUEST })
  }

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return NextResponse.json({ error: 'Invalid url' }, { status: HTTP_BAD_REQUEST })
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== GOOGLE_PHOTOS_CDN_HOSTNAME) {
    return NextResponse.json({ error: 'Unsupported host' }, { status: HTTP_BAD_REQUEST })
  }

  // Forward the browser's Range header so seeking/scrubbing works — the
  // upstream CDN responds 206 Partial Content when it's present (verified
  // live), and NextResponse relays that status straight through below.
  const range = request.headers.get('range')

  let upstream: Response
  try {
    upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        ...(range ? { Range: range } : {}),
      },
    })
  } catch {
    return NextResponse.json({ error: UPSTREAM_FETCH_FAILED }, { status: HTTP_BAD_GATEWAY })
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: UPSTREAM_FETCH_FAILED }, { status: HTTP_BAD_GATEWAY })
  }

  const headers = new Headers()
  for (const key of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
    const value = upstream.headers.get(key)
    if (value) headers.set(key, value)
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers })
}
