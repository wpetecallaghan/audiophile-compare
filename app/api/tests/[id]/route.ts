import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isValidForumLink } from '@/lib/tests/validate-forum-link'
import { revalidateTag } from 'next/cache'
import {
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: test, error } = await supabase
    .from('tests')
    .select(`
      id, title, status, revealed_at, created_at,
      creator_id,
      creator:users!creator_id(display_name),
      track:tracks(artist, title, album, passage_note),
      clips(id, label, source_url, provider, media_type, url_status)
    `)
    .eq('id', id)
    .single()

  if (error || !test) {
    return NextResponse.json({ error: 'Test not found' }, { status: HTTP_NOT_FOUND })
  }

  // Determine if the caller is entitled to see clip_mapping
  const isCreator = user?.id === test.creator_id
  const isRevealed = test.status === 'revealed'
  const canSeeMapping = isCreator || isRevealed

  let mapping = null
  if (canSeeMapping) {
    const { data } = await supabase
      .from('clip_mapping')
      .select('before_clip_id, after_clip_id')
      .eq('test_id', id)
      .single()
    mapping = data
  }

  // Determine if the caller can see vote tallies
  let hasVoted = false
  if (user) {
    const { count } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', id)
      .eq('user_id', user.id)
    hasVoted = (count ?? 0) > 0
  }

  return NextResponse.json({
    test: {
      ...test,
      // Never leak creator_id to the client — isCreator is enough
      creator_id: undefined,
    },
    isCreator,
    isRevealed,
    canSeeTally: isRevealed || hasVoted,
    mapping,    // null unless entitled
  })
}

// DELETE /api/tests/[id] — creator only, and only if the test has zero votes.
// Once a vote exists the test is frozen forever — listening is a real time
// commitment, so it must be respected. Cascades to the test's own `clips`/
// `clip_mapping` rows (ON DELETE CASCADE) — nothing else references them.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: HTTP_UNAUTHORIZED })
  }

  // Verify ownership — return 404 to avoid leaking test existence
  const { data: test } = await supabase
    .from('tests')
    .select('id, creator_id')
    .eq('id', id)
    .single()

  if (!test || test.creator_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: HTTP_NOT_FOUND })
  }

  const { count } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('test_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'This test has votes and can no longer be deleted' },
      { status: HTTP_CONFLICT },
    )
  }

  const { error } = await supabase
    .from('tests')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete test' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  // step 75 — avoids a stale cached test-core entry lingering for a
  // deleted test's id until its own revalidate window expires. See
  // reveal/route.ts for why { expire: 0 } (not a named profile).
  revalidateTag(`test-${id}`, { expire: 0 })

  return NextResponse.json({ ok: true })
}

// PATCH /api/tests/[id] — creator only. Scoped to forum_link only, not a
// general-purpose test-patch endpoint — no other field has an edit need
// yet (step 46). Deliberately no reveal or vote-count gating, unlike
// PATCH /api/clips/[id]'s voteCount === 0 restriction — a forum link is
// pure metadata about the discussion, not about what's being tested, so
// editing it after votes or after reveal doesn't retroactively
// misrepresent anything a listener heard.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: HTTP_UNAUTHORIZED })
  }

  // Verify ownership — return 404 to avoid leaking test existence, same
  // pattern as DELETE above.
  const { data: test } = await supabase
    .from('tests')
    .select('id, creator_id')
    .eq('id', id)
    .single()

  if (!test || test.creator_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: HTTP_NOT_FOUND })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: HTTP_BAD_REQUEST })
  }

  const { forum_link } = body as { forum_link?: string | null }
  const trimmedForumLink = forum_link?.trim() || null

  if (trimmedForumLink && !isValidForumLink(trimmedForumLink)) {
    return NextResponse.json(
      { error: 'forum_link must be a valid http(s) URL' },
      { status: HTTP_BAD_REQUEST }
    )
  }

  const { data: updated, error } = await supabase
    .from('tests')
    .update({ forum_link: trimmedForumLink })
    .eq('id', id)
    .select('forum_link')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Failed to update forum link' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  // step 75 — forum_link is part of the cached test-core data. See
  // reveal/route.ts for why { expire: 0 } (not a named profile).
  revalidateTag(`test-${id}`, { expire: 0 })

  return NextResponse.json({ forum_link: updated.forum_link })
}