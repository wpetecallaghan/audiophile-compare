import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { STATUS_OK } from '@/lib/clips/check-url'
import { PROVIDER_UNKNOWN, MEDIA_TYPE_UNKNOWN } from '@/lib/clips/detect-provider'
import {
  HTTP_BAD_REQUEST,
  HTTP_CONFLICT,
  HTTP_CREATED,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

type CrossCheckBody = {
  track_id: string
  snapshot_a_id: string
  snapshot_b_id: string
  clip_a_source_url: string
  clip_a_provider: string
  clip_a_media_type: string
  clip_b_source_url: string
  clip_b_provider: string
  clip_b_media_type: string
  title: string
}

// POST /api/tests/cross-check
//
// Creates a new blind test by reusing clip URLs from existing tests.
// No new recording is required — the caller supplies the source_urls
// discovered via GET /api/systems/[id]/cross-check.
//
// clip_a corresponds to snapshot_a_id; clip_b to snapshot_b_id.
// The before/after mapping is inferred from snapshot version numbers:
// the lower version is "before".
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
    track_id,
    snapshot_a_id,
    snapshot_b_id,
    clip_a_source_url,
    clip_a_provider,
    clip_a_media_type,
    clip_b_source_url,
    clip_b_provider,
    clip_b_media_type,
    title,
  } = body as CrossCheckBody

  if (
    !track_id || !snapshot_a_id || !snapshot_b_id || !title?.trim() ||
    !clip_a_source_url || !clip_b_source_url
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: HTTP_BAD_REQUEST })
  }

  if (snapshot_a_id === snapshot_b_id) {
    return NextResponse.json(
      { error: 'snapshot_a_id and snapshot_b_id must be different' },
      { status: HTTP_BAD_REQUEST },
    )
  }

  // Verify ownership: both snapshots must belong to a system owned by this user
  const { data: snapshots } = await supabase
    .from('system_snapshots')
    .select('id, version, systems!inner(owner_id)')
    .in('id', [snapshot_a_id, snapshot_b_id])

  const ownedSnapshots = (snapshots ?? []).filter(s => {
    const sys = s.systems as { owner_id: string } | { owner_id: string }[]
    const ownerId = Array.isArray(sys) ? sys[0]?.owner_id : sys?.owner_id
    return ownerId === user.id
  })

  const ownedIds = ownedSnapshots.map(s => s.id)
  if (!ownedIds.includes(snapshot_a_id) || !ownedIds.includes(snapshot_b_id)) {
    return NextResponse.json(
      { error: 'One or both snapshots do not belong to you' },
      { status: HTTP_FORBIDDEN },
    )
  }

  // Duplicate check — test already exists for this track + snapshot pair in either direction
  const [{ data: existingAB }, { data: existingBA }] = await Promise.all([
    supabase
      .from('tests')
      .select('id')
      .eq('track_id', track_id)
      .eq('snapshot_a_id', snapshot_a_id)
      .eq('snapshot_b_id', snapshot_b_id)
      .maybeSingle(),
    supabase
      .from('tests')
      .select('id')
      .eq('track_id', track_id)
      .eq('snapshot_a_id', snapshot_b_id)
      .eq('snapshot_b_id', snapshot_a_id)
      .maybeSingle(),
  ])

  if (existingAB || existingBA) {
    return NextResponse.json(
      { error: 'A test already exists for this track and snapshot combination' },
      { status: HTTP_CONFLICT },
    )
  }

  // Infer before/after from snapshot version numbers — lower version = older = before.
  // Clip A corresponds to snapshot_a_id; Clip B to snapshot_b_id.
  const versionMap = new Map(ownedSnapshots.map(s => [s.id, s.version as number]))
  const versionA = versionMap.get(snapshot_a_id) ?? 0
  const versionB = versionMap.get(snapshot_b_id) ?? 0
  const beforeIsA = versionA <= versionB

  // --- Write in dependency order ---

  // 1. Create the test
  const { data: test, error: testError } = await supabase
    .from('tests')
    .insert({
      creator_id:    user.id,
      track_id,
      snapshot_a_id,
      snapshot_b_id,
      title:         title.trim(),
      status:        'open',
    })
    .select('id')
    .single()

  if (testError || !test) {
    return NextResponse.json({ error: 'Failed to create test' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  // 2. Insert both clips, reusing the source URLs from existing recordings
  const { data: clips, error: clipsError } = await supabase
    .from('clips')
    .insert([
      {
        test_id:    test.id,
        label:      'A',
        source_url: clip_a_source_url,
        provider:   clip_a_provider   || PROVIDER_UNKNOWN,
        media_type: clip_a_media_type || MEDIA_TYPE_UNKNOWN,
        url_status: STATUS_OK,
      },
      {
        test_id:    test.id,
        label:      'B',
        source_url: clip_b_source_url,
        provider:   clip_b_provider   || PROVIDER_UNKNOWN,
        media_type: clip_b_media_type || MEDIA_TYPE_UNKNOWN,
        url_status: STATUS_OK,
      },
    ])
    .select('id, label')

  if (clipsError || !clips || clips.length !== 2) {
    await supabase.from('tests').delete().eq('id', test.id)
    return NextResponse.json({ error: 'Failed to create clips' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  const clipA = clips.find(c => c.label === 'A')!
  const clipB = clips.find(c => c.label === 'B')!

  // 3. Insert clip_mapping — before/after inferred from version numbers
  const { error: mappingError } = await supabase
    .from('clip_mapping')
    .insert({
      test_id:        test.id,
      before_clip_id: beforeIsA ? clipA.id : clipB.id,
      after_clip_id:  beforeIsA ? clipB.id : clipA.id,
    })

  if (mappingError) {
    await supabase.from('clips').delete().eq('test_id', test.id)
    await supabase.from('tests').delete().eq('id', test.id)
    return NextResponse.json({ error: 'Failed to create clip mapping' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  return NextResponse.json({ testId: test.id }, { status: HTTP_CREATED })
}
