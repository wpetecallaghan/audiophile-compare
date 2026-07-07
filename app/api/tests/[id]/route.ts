import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
    return NextResponse.json({ error: 'Test not found' }, { status: 404 })
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
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Verify ownership — return 404 to avoid leaking test existence
  const { data: test } = await supabase
    .from('tests')
    .select('id, creator_id')
    .eq('id', id)
    .single()

  if (!test || test.creator_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { count } = await supabase
    .from('votes')
    .select('*', { count: 'exact', head: true })
    .eq('test_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'This test has votes and can no longer be deleted' },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('tests')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete test' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}