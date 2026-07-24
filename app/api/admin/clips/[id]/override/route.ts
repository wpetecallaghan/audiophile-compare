import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin/is-admin-email'
import { STATUS_OK, STATUS_DEAD } from '@/lib/clips/check-url'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

type Props = {
  params: Promise<{ id: string }>
}

// PATCH /api/admin/clips/[id]/override — step 64.
//
// Admin-only correction of a clip's health status, for when the URL
// health-check cron gets it wrong: a false positive (some host's
// bot-mitigation tripping the cron, step 50's class of bug) or a false
// negative (a YouTube/Vimeo embed the cron can never detect as dead,
// step 27's documented blind spot). Gated by session + isAdminEmail
// (api-conventions.md Rule 8), not clip/test ownership — any admin can
// correct any clip, not just the test's own creator. Uses the
// admin/service-role client, which bypasses RLS entirely (no RLS policy
// change needed), same pattern as erase-user-data/claim.
//
// Not gated by vote count or reveal status — this corrects a signal
// about link health, not what was actually tested.
//
// { override: 'ok' | 'dead' } forces that status regardless of the
// cron's own url_status; { override: null } clears the override,
// reverting to whatever the cron last measured. lib/clips/
// effective-url-status.ts composes the two wherever "is this clip
// broken" is decided.
export async function PATCH(request: NextRequest, { params }: Props) {
  const { id: clipId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: HTTP_UNAUTHORIZED })
  }

  // 404, not 403 — same reasoning as /version, erase-user-data, and
  // claim: don't confirm this route's existence to a non-admin.
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Not found' }, { status: HTTP_NOT_FOUND })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: HTTP_BAD_REQUEST })
  }

  const parsedBody = body as { override?: unknown }

  if (!('override' in parsedBody)) {
    return NextResponse.json({ error: 'override is required' }, { status: HTTP_BAD_REQUEST })
  }

  const { override } = parsedBody

  if (override !== null && override !== STATUS_OK && override !== STATUS_DEAD) {
    return NextResponse.json(
      { error: `override must be '${STATUS_OK}', '${STATUS_DEAD}', or null` },
      { status: HTTP_BAD_REQUEST },
    )
  }

  const admin = createAdminClient()

  const { data: updated, error } = await admin
    .from('clips')
    .update({
      admin_override: override,
      admin_override_by: override ? user.id : null,
      admin_override_at: override ? new Date().toISOString() : null,
    })
    .eq('id', clipId)
    .select('id, test_id')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to update clip' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  // The admin client bypasses RLS entirely, so a missing row here can
  // only mean the clip id doesn't exist — unlike the creator-scoped
  // PATCH /api/clips/[id], there's no ownership ambiguity to fold into a
  // generic 500.
  if (!updated) {
    return NextResponse.json({ error: 'Clip not found' }, { status: HTTP_NOT_FOUND })
  }

  // step 75 — this clip's row is part of its parent test's cached core
  // data; an admin's own explicit override should be visible immediately,
  // not wait out the cache's bounded staleness window like the health
  // check cron's own writes do. See tests/[id]/reveal/route.ts for why
  // { expire: 0 } (not a named profile).
  revalidateTag(`test-${updated.test_id}`, { expire: 0 })

  return NextResponse.json({ ok: true })
}
