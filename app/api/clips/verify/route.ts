import { createClient } from '@/lib/supabase/server'
import { detectProvider } from '@/lib/clips/detect-provider'
import { checkDirectUrl, STATUS_OK } from '@/lib/clips/check-url'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  // Auth check — clip verification requires login per your spec
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Parse and validate the request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Type narrowing — TypeScript doesn't know the shape of `body` at runtime,
  // so we check it explicitly. This is the JS equivalent of model validation
  // in ASP.NET or a DTO check in Java/Spring.
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).url !== 'string'
  ) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  const { url } = body as { url: string }

  if (!url.trim()) {
    return NextResponse.json({ error: 'url must not be empty' }, { status: 400 })
  }

  // Step 1: detect provider from URL shape alone
  const detected = detectProvider(url)

  // Step 2: for direct URLs, HEAD the server to confirm reachability and media type
  if (detected.provider === 'direct') {
    const checked = await checkDirectUrl(detected)
    return NextResponse.json({
      provider:      detected.provider,
      media_type:    checked.media_type,
      url_status:    checked.url_status,
      canonical_url: detected.canonical_url,
      embed_id:      null,
      duration_ms:   null,
    })
  }

  // YouTube and Vimeo: trust the URL pattern; no HEAD request possible
  return NextResponse.json({
    provider:      detected.provider,
    media_type:    detected.media_type,
    url_status:    STATUS_OK,
    canonical_url: detected.canonical_url,
    embed_id:      detected.embed_id,
    duration_ms:   null,
  })
}