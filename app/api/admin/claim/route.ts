import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin/is-admin-email'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// POST /api/admin/claim
//
// Admin-triggered, human-verified claim flow (merges a placeholder
// account into a real, registered account) — build-history-ingestion.md
// step 39. Gated by session + isAdminEmail (api-conventions.md Rule 8),
// not INGEST_SECRET — same shape as erase-user-data/route.ts, the
// second real caller of Rule 8.
//
// preview: true does a read-only count of what would be reassigned, no
// mutation — mirrors erase-user-data's own preview branch (decision 9).
type RequestBody = {
  placeholderUserId?: string
  realUserId?: string
  preview?: boolean
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // 404, not 403 — same reasoning as /version and erase-user-data: don't
  // confirm this route's existence/purpose to a non-admin.
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { placeholderUserId, realUserId, preview } = body as RequestBody

  if (!placeholderUserId || !realUserId) {
    return NextResponse.json(
      { error: 'placeholderUserId and realUserId are required' },
      { status: 400 },
    )
  }

  if (placeholderUserId === realUserId) {
    return NextResponse.json(
      { error: 'placeholderUserId and realUserId must differ' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()

  if (preview) {
    const [{ count: systems }, { count: tests }, { count: tracks }, { count: comments }, { count: votes }] =
      await Promise.all([
        admin.from('systems').select('*', { count: 'exact', head: true }).eq('owner_id', placeholderUserId),
        admin.from('tests').select('*', { count: 'exact', head: true }).eq('creator_id', placeholderUserId),
        admin.from('tracks').select('*', { count: 'exact', head: true }).eq('created_by', placeholderUserId),
        admin.from('comments').select('*', { count: 'exact', head: true }).eq('user_id', placeholderUserId),
        admin.from('votes').select('*', { count: 'exact', head: true }).eq('user_id', placeholderUserId),
      ])
    return NextResponse.json({
      preview: {
        systems: systems ?? 0,
        tests: tests ?? 0,
        tracks: tracks ?? 0,
        comments: comments ?? 0,
        votes: votes ?? 0,
      },
    })
  }

  const { data, error } = await admin.rpc('claim_placeholder', {
    placeholder_user_id: placeholderUserId,
    real_user_id: realUserId,
  })
  if (error) {
    return NextResponse.json(
      { error: `claim_placeholder failed: ${error.message}` },
      { status: 500 },
    )
  }

  // Admin SDK call, not a SQL statement — can't run inside a Postgres
  // function, same constraint create-placeholder-author.ts and
  // erase-user-data/route.ts's 'full' scope already work within. Runs
  // last: by this point public.users for the placeholder is already
  // gone, so a failure here just leaves an orphaned auth identity to
  // retry deleting, rather than a dangling public.users row.
  const { error: authError } = await admin.auth.admin.deleteUser(placeholderUserId)
  if (authError) {
    return NextResponse.json(
      { error: `auth user deletion failed: ${authError.message}`, partial: data },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, result: data })
}
