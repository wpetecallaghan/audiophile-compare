import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectProvider } from '@/lib/clips/detect-provider'
import type { ClipProvider } from '@/lib/clips/detect-provider'
import { checkDirectUrl } from '@/lib/clips/check-url'
import type { UrlStatus } from '@/lib/clips/check-url'
import { nextUrlStatus } from '@/lib/clips/next-url-status'

// GET /api/cron/check-urls
//
// Vercel Cron job — runs daily at 02:00 UTC (configured in vercel.json).
// Checks the reachability of every clip with a checkable provider and
// updates url_status and media_type in the database where the value has
// changed.
//
// Uses the service role client because this route runs without a user session.
// Protected by CRON_SECRET — Vercel passes this automatically as
// Authorization: Bearer <CRON_SECRET> when invoking cron routes.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // 'direct' and 'google-drive' are the only providers whose embed
  // endpoint's HTTP status actually distinguishes reachable from gone
  // (step 58) — YouTube and Vimeo stay excluded because their embed pages
  // return 200 regardless of whether the specific video exists.
  const CHECKED_PROVIDERS: ClipProvider[] = ['direct', 'google-drive']
  const { data: clips, error } = await supabase
    .from('clips')
    .select('id, source_url, url_status, media_type')
    .in('provider', CHECKED_PROVIDERS)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch clips' }, { status: 500 })
  }

  let checked = 0
  let updated = 0

  for (const clip of clips ?? []) {
    const detected = detectProvider(clip.source_url)
    // checkDirectUrl is provider-agnostic despite its name — it just HEADs
    // detected.canonical_url, which detectProvider already resolves to a
    // Drive clip's /preview URL. Safe to reuse for google-drive: Drive's
    // /preview page is always served as text/html, which resolves to
    // media_type 'unknown' below, so the never-downgrade guard skips it
    // and a Drive clip's real media_type is never overwritten.
    const result = await checkDirectUrl(detected)
    checked++

    const updates: Record<string, string> = {}

    // One-day grace period before a clip is marked 'dead' — see
    // lib/clips/next-url-status.ts. Absorbs one-off false positives (e.g. a
    // host's bot-mitigation blocking this cron's request) without weakening
    // detection of a URL that's actually gone; a persistently dead URL still
    // reaches 'dead' within two daily runs.
    const nextStatus = nextUrlStatus(clip.url_status as UrlStatus, result.url_status)
    if (nextStatus !== clip.url_status) {
      updates.url_status = nextStatus
    }

    // Upgrade media_type from 'unknown' when the HEAD response tells us more.
    // Never downgrade a known type back to 'unknown' (HEAD responses can omit Content-Type).
    if (result.media_type !== 'unknown' && result.media_type !== clip.media_type) {
      updates.media_type = result.media_type
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('clips').update(updates).eq('id', clip.id)
      updated++
    }
  }

  return NextResponse.json({ checked, updated }, { status: 200 })
}
