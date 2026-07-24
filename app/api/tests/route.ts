import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isValidForumLink } from '@/lib/tests/validate-forum-link'
import { STATUS_OK } from '@/lib/clips/check-url'
import type { ClipProvider, MediaType } from '@/lib/clips/detect-provider'
import {
  HTTP_BAD_REQUEST,
  HTTP_CREATED,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

type ClipInput = {
  source_url: string
  canonical_url: string
  provider: ClipProvider
  media_type: MediaType
  embed_id: string | null
}

type CreateTestBody = {
  title: string
  track_id: string
  snapshot_a_id: string
  snapshot_b_id: string
  clip_a: ClipInput        // the clip labelled 'A' in the blind test
  clip_b: ClipInput        // the clip labelled 'B' in the blind test
  before_is_a: boolean     // true = clip A is the 'before' system; false = clip B is
  forum_link?: string | null  // optional — link to a forum thread discussing this test (step 46)
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

  const {
    title,
    track_id,
    snapshot_a_id,
    snapshot_b_id,
    clip_a,
    clip_b,
    before_is_a,
    forum_link,
  } = body as CreateTestBody

  // Validate required fields
  if (!title?.trim() || !track_id || !snapshot_a_id || !snapshot_b_id) {
    return NextResponse.json(
      { error: 'title, track_id, snapshot_a_id, snapshot_b_id are required' },
      { status: HTTP_BAD_REQUEST }
    )
  }

  if (!clip_a?.source_url || !clip_b?.source_url) {
    return NextResponse.json(
      { error: 'clip_a and clip_b are required' },
      { status: HTTP_BAD_REQUEST }
    )
  }

  const trimmedForumLink = forum_link?.trim() || null
  if (trimmedForumLink && !isValidForumLink(trimmedForumLink)) {
    return NextResponse.json(
      { error: 'forum_link must be a valid http(s) URL' },
      { status: HTTP_BAD_REQUEST }
    )
  }

  // Verify that snapshot_a and snapshot_b belong to systems owned by this user.
  // Never trust client-supplied IDs without an ownership check.
  const { data: snapshots } = await supabase
    .from('system_snapshots')
    .select('id, systems!inner(owner_id)')
    .in('id', [snapshot_a_id, snapshot_b_id])

  const ownedIds = snapshots
    ?.filter(s => {
      const sys = s.systems as { owner_id: string } | { owner_id: string }[]
      const ownerId = Array.isArray(sys) ? sys[0]?.owner_id : sys?.owner_id
      return ownerId === user.id
    })
    .map(s => s.id) ?? []

  if (!ownedIds.includes(snapshot_a_id) || !ownedIds.includes(snapshot_b_id)) {
    return NextResponse.json(
      { error: 'One or both snapshots do not belong to you' },
      { status: HTTP_FORBIDDEN }
    )
  }

  // --- Write in dependency order ---

  // 1. Create the test row
  const { data: test, error: testError } = await supabase
    .from('tests')
    .insert({
      creator_id:    user.id,
      track_id,
      snapshot_a_id,
      snapshot_b_id,
      title:         title.trim(),
      status:        'open',
      forum_link:    trimmedForumLink,
    })
    .select('id')
    .single()

  if (testError || !test) {
    return NextResponse.json({ error: 'Failed to create test' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  // 2. Insert both clips
  const { data: clips, error: clipsError } = await supabase
    .from('clips')
    .insert([
      {
        test_id:    test.id,
        label:      'A',
        source_url: clip_a.source_url,
        provider:   clip_a.provider,
        media_type: clip_a.media_type,
        url_status: STATUS_OK,
        // canonical_url and embed_id aren't columns in the schema —
        // source_url holds the original; provider detection is re-run on display
      },
      {
        test_id:    test.id,
        label:      'B',
        source_url: clip_b.source_url,
        provider:   clip_b.provider,
        media_type: clip_b.media_type,
        url_status: STATUS_OK,
      },
    ])
    .select('id, label')

  if (clipsError || !clips || clips.length !== 2) {
    // Clean up the orphaned test row
    await supabase.from('tests').delete().eq('id', test.id)
    return NextResponse.json({ error: 'Failed to create clips' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  const clipA = clips.find(c => c.label === 'A')!
  const clipB = clips.find(c => c.label === 'B')!

  // 3. Insert clip_mapping — before/after identity recorded here only
  const { error: mappingError } = await supabase
    .from('clip_mapping')
    .insert({
      test_id:        test.id,
      before_clip_id: before_is_a ? clipA.id : clipB.id,
      after_clip_id:  before_is_a ? clipB.id : clipA.id,
    })

  if (mappingError) {
    // Clean up both clips and the test
    await supabase.from('clips').delete().eq('test_id', test.id)
    await supabase.from('tests').delete().eq('id', test.id)
    return NextResponse.json({ error: 'Failed to record clip mapping' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  return NextResponse.json({ testId: test.id }, { status: HTTP_CREATED })
}