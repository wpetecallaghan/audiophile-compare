import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/admin/is-admin-email'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

// POST /api/admin/erase-user-data
//
// Admin-triggered, human-verified data erasure — build-history-ingestion.md
// step 38. Gated by session + isAdminEmail (mirrors app/version/page.tsx),
// not INGEST_SECRET — this is a human, browser-driven action from the site
// owner's own logged-in session, not a server-to-server call.
//
// Three scopes, one-to-one with step 38's three real scenarios:
//   'votes'   — case 1: an unmerged placeholder's votes only.
//   'content' — case 2: an unmerged placeholder's tests + systems.
//   'full'    — case 3: a registered user's everything, including the
//               account itself (votes + content + the account).
// preview: true does a read-only count, no deletion — the admin route's
// half of decision 8's "preview before destroy" (the other half, actually
// calling the destructive functions, only ever happens on preview: false).
type Scope = 'votes' | 'content' | 'full'

type RequestBody = {
  userId?: string
  scope?: Scope
  preview?: boolean
}

const VALID_SCOPES: Scope[] = ['votes', 'content', 'full']

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: HTTP_UNAUTHORIZED })
  }

  // 404, not 403 — same reasoning as /version: don't confirm this route's
  // existence/purpose to a non-admin.
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: 'Not found' }, { status: HTTP_NOT_FOUND })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: HTTP_BAD_REQUEST })
  }

  const { userId, scope, preview } = body as RequestBody

  if (!userId || !scope || !VALID_SCOPES.includes(scope)) {
    return NextResponse.json(
      { error: 'userId and a valid scope (votes|content|full) are required' },
      { status: HTTP_BAD_REQUEST },
    )
  }

  const admin = createAdminClient()

  if (preview) {
    const [{ count: votes }, { count: tests }, { count: systems }] = await Promise.all([
      admin.from('votes').select('*', { count: 'exact', head: true }).eq('user_id', userId),
      admin.from('tests').select('*', { count: 'exact', head: true }).eq('creator_id', userId),
      admin.from('systems').select('*', { count: 'exact', head: true }).eq('owner_id', userId),
    ])
    return NextResponse.json({
      preview: { votes: votes ?? 0, tests: tests ?? 0, systems: systems ?? 0 },
    })
  }

  const result: Record<string, unknown> = {}

  if (scope === 'votes' || scope === 'full') {
    const { data, error } = await admin.rpc('erase_user_votes', { target_user_id: userId })
    if (error) {
      return NextResponse.json(
        { error: `erase_user_votes failed: ${error.message}`, partial: result },
        { status: HTTP_INTERNAL_SERVER_ERROR },
      )
    }
    result.votes = data
  }

  if (scope === 'content' || scope === 'full') {
    const { data, error } = await admin.rpc('erase_user_content', { target_user_id: userId })
    if (error) {
      return NextResponse.json(
        { error: `erase_user_content failed: ${error.message}`, partial: result },
        { status: HTTP_INTERNAL_SERVER_ERROR },
      )
    }
    result.content = data
  }

  if (scope === 'full') {
    const { data, error } = await admin.rpc('erase_user_account', { target_user_id: userId })
    if (error) {
      return NextResponse.json(
        { error: `erase_user_account failed: ${error.message}`, partial: result },
        { status: HTTP_INTERNAL_SERVER_ERROR },
      )
    }
    result.account = data

    // Admin SDK call, not a SQL statement — can't run inside a Postgres
    // function, same constraint create-placeholder-author.ts already
    // works within. Runs last: by this point public.users (and every
    // other reference to userId) is already gone, so a failure here just
    // leaves an orphaned auth identity to retry deleting, rather than a
    // dangling public.users row still carrying this person's email/name.
    const { error: authError } = await admin.auth.admin.deleteUser(userId)
    if (authError) {
      return NextResponse.json(
        { error: `auth user deletion failed: ${authError.message}`, partial: result },
        { status: HTTP_INTERNAL_SERVER_ERROR },
      )
    }
    result.authDeleted = true
  }

  return NextResponse.json({ ok: true, result })
}
