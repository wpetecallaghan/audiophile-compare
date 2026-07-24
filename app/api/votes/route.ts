import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { STATUS_DEAD, type UrlStatus } from '@/lib/clips/check-url'
import { effectiveUrlStatus } from '@/lib/clips/effective-url-status'
import {
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

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
    return NextResponse.json({ error: 'Unauthorised' }, { status: HTTP_UNAUTHORIZED })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: HTTP_BAD_REQUEST })
  }

  const { test_id, votes } = body as { test_id?: string; votes?: VoteInput[] }

  if (!test_id || !Array.isArray(votes) || votes.length === 0) {
    return NextResponse.json(
      { error: 'test_id and a non-empty votes array are required' },
      { status: HTTP_BAD_REQUEST },
    )
  }

  // Verify test exists and is still open
  const { data: test } = await supabase
    .from('tests')
    .select('id, status')
    .eq('id', test_id)
    .single()

  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: HTTP_NOT_FOUND })
  }

  if (test.status === 'revealed') {
    return NextResponse.json(
      { error: 'Cannot vote on a revealed test' },
      { status: HTTP_CONFLICT },
    )
  }

  // Security: verify every chosen_clip_id belongs to this test
  const chosenClipIds = [...new Set(votes.map(v => v.chosen_clip_id))]
  const { data: clips } = await supabase
    .from('clips')
    .select('id, url_status, admin_override')
    .eq('test_id', test_id)
    .in('id', chosenClipIds)

  if (!clips || clips.length !== chosenClipIds.length) {
    return NextResponse.json(
      { error: 'One or more clip IDs are invalid for this test' },
      { status: HTTP_BAD_REQUEST },
    )
  }

  // Defense in depth — the UI already hides the vote form when a clip is
  // dead, but a direct API call could bypass that. Honors an admin
  // override (step 64) the same way the UI's own hasDeadClip does.
  if (clips.some(c => effectiveUrlStatus(c.url_status as UrlStatus, c.admin_override as UrlStatus | null) === STATUS_DEAD)) {
    return NextResponse.json(
      { error: 'One or more chosen clips are currently unreachable' },
      { status: HTTP_CONFLICT },
    )
  }

  // Defense in depth — the UI already only ever offers active techniques
  // (app/tests/[id]/page.tsx filters on is_active), but a direct API call
  // could bypass that and vote under a deactivated technique
  const techniqueIds = [...new Set(votes.map(v => v.technique_id))]
  const { data: activeTechniques } = await supabase
    .from('listening_techniques')
    .select('id')
    .eq('is_active', true)
    .in('id', techniqueIds)

  if (!activeTechniques || activeTechniques.length !== techniqueIds.length) {
    return NextResponse.json(
      { error: 'One or more techniques are not currently active' },
      { status: HTTP_BAD_REQUEST },
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
    return NextResponse.json({ error: 'Failed to save votes' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  return NextResponse.json({ success: true }, { status: HTTP_OK })
}
