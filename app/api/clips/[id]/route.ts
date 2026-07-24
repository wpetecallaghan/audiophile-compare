import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import {
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

type Props = {
  params: Promise<{ id: string }>
}

// PATCH /api/clips/[id] — replace a clip's source URL.
//
// Creator-only (via the clip's parent test), and only if the test has zero
// votes — replacing a clip's URL changes what's being compared, which would
// retroactively misrepresent what earlier listeners actually heard on a
// voted test. Trusts the client-supplied verified fields the same way
// POST /api/tests already does (the client already called
// POST /api/clips/verify moments earlier) rather than re-verifying
// server-side.
export async function PATCH(request: NextRequest, { params }: Props) {
  const { id: clipId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: HTTP_UNAUTHORIZED })
  }

  // Verify ownership via the clip's parent test — return 404 to avoid
  // leaking clip existence
  const { data: clip } = await supabase
    .from('clips')
    .select('id, test_id, tests!inner(creator_id)')
    .eq('id', clipId)
    .single()

  const test = clip
    ? (Array.isArray(clip.tests) ? clip.tests[0] : clip.tests)
    : null

  if (!clip || !test || test.creator_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: HTTP_NOT_FOUND })
  }

  const { count } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('test_id', clip.test_id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'This test has votes and its clips can no longer be replaced' },
      { status: HTTP_CONFLICT },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: HTTP_BAD_REQUEST })
  }

  const { source_url, provider, media_type, url_status } = body as {
    source_url?: string
    provider?: string
    media_type?: string
    url_status?: string
  }

  if (!source_url?.trim() || !provider || !media_type || !url_status) {
    return NextResponse.json(
      { error: 'source_url, provider, media_type, and url_status are required' },
      { status: HTTP_BAD_REQUEST },
    )
  }

  // .select().single() is required here, not just for the response shape —
  // without it, a missing/misconfigured RLS UPDATE policy makes Postgres
  // silently affect zero rows with no error, and the route would report
  // success despite nothing changing. See api-conventions.md Rule 5.
  const { data: updated, error } = await supabase
    .from('clips')
    .update({
      source_url: source_url.trim(),
      provider,
      media_type,
      url_status,
    })
    .eq('id', clipId)
    .select('id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Failed to update clip' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  // step 75 — this clip's row is part of its parent test's cached core
  // data. See app/api/tests/[id]/reveal/route.ts for why { expire: 0 }
  // (not a named profile).
  revalidateTag(`test-${clip.test_id}`, { expire: 0 })

  return NextResponse.json({ ok: true })
}
