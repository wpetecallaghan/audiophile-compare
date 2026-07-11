import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { STATUS_DEAD } from '@/lib/clips/check-url'

type VoteInput = {
  technique_id: string
  chosen_clip_id: string
  other_description?: string
  observation?: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { test_id, votes } = body as { test_id?: string; votes?: VoteInput[] }

  if (!test_id || !Array.isArray(votes) || votes.length === 0) {
    return NextResponse.json(
      { error: 'test_id and a non-empty votes array are required' },
      { status: 400 },
    )
  }

  // Verify test exists and is still open
  const { data: test } = await supabase
    .from('tests')
    .select('id, status')
    .eq('id', test_id)
    .single()

  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  }

  if (test.status === 'revealed') {
    return NextResponse.json(
      { error: 'Cannot vote on a revealed test' },
      { status: 409 },
    )
  }

  // Security: verify every chosen_clip_id belongs to this test
  const chosenClipIds = [...new Set(votes.map(v => v.chosen_clip_id))]
  const { data: clips } = await supabase
    .from('clips')
    .select('id, url_status')
    .eq('test_id', test_id)
    .in('id', chosenClipIds)

  if (!clips || clips.length !== chosenClipIds.length) {
    return NextResponse.json(
      { error: 'One or more clip IDs are invalid for this test' },
      { status: 400 },
    )
  }

  // Defense in depth — the UI already hides the vote form when a clip is
  // dead, but a direct API call could bypass that
  if (clips.some(c => c.url_status === STATUS_DEAD)) {
    return NextResponse.json(
      { error: 'One or more chosen clips are currently unreachable' },
      { status: 409 },
    )
  }

  // Upsert — UNIQUE (test_id, user_id, technique_id) allows re-voting
  const rows = votes.map(v => ({
    test_id,
    user_id: user.id,
    chosen_clip_id: v.chosen_clip_id,
    technique_id: v.technique_id,
    other_description: v.other_description?.trim() ?? null,
    observation: v.observation?.trim() ?? null,
  }))

  const { error } = await supabase
    .from('votes')
    .upsert(rows, { onConflict: 'test_id,user_id,technique_id' })

  if (error) {
    return NextResponse.json({ error: 'Failed to save votes' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
