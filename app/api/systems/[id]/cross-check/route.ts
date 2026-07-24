import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { findSharedClips } from '@/lib/clips/find-shared-clips'
import type { TestWithClips } from '@/lib/clips/find-shared-clips'
import { HTTP_BAD_REQUEST, HTTP_NOT_FOUND, HTTP_UNAUTHORIZED } from '@/lib/api/http-status'

type Props = {
  params: Promise<{ id: string }>
}

// GET /api/systems/[id]/cross-check?snapshot_a_id=…&snapshot_b_id=…
//
// Returns the tracks that have existing clip recordings for both snapshots,
// ready to create a cross-check test without a new recording.
export async function GET(request: NextRequest, { params }: Props) {
  const { id: systemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: HTTP_UNAUTHORIZED })
  }

  // Verify the user owns this system — return 404 to avoid leaking existence
  const { data: system } = await supabase
    .from('systems')
    .select('id, owner_id')
    .eq('id', systemId)
    .single()

  if (!system || system.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: HTTP_NOT_FOUND })
  }

  const { searchParams } = new URL(request.url)
  const snapshotAId = searchParams.get('snapshot_a_id')
  const snapshotBId = searchParams.get('snapshot_b_id')

  if (!snapshotAId || !snapshotBId) {
    return NextResponse.json(
      { error: 'snapshot_a_id and snapshot_b_id are required' },
      { status: HTTP_BAD_REQUEST },
    )
  }

  if (snapshotAId === snapshotBId) {
    return NextResponse.json(
      { error: 'snapshot_a_id and snapshot_b_id must be different' },
      { status: HTTP_BAD_REQUEST },
    )
  }

  // Verify both snapshots belong to this system
  const { data: snapshots } = await supabase
    .from('system_snapshots')
    .select('id')
    .eq('system_id', systemId)
    .in('id', [snapshotAId, snapshotBId])

  if (!snapshots || snapshots.length !== 2) {
    return NextResponse.json(
      { error: 'One or both snapshots do not belong to this system' },
      { status: HTTP_BAD_REQUEST },
    )
  }

  // Fetch tests referencing each snapshot — most recent first so that
  // findSharedClips uses the latest clip URL when a snapshot appears multiple times
  const [{ data: rawTestsA }, { data: rawTestsB }] = await Promise.all([
    supabase
      .from('tests')
      .select('id, track_id, snapshot_a_id, snapshot_b_id, clips(id, label, source_url, provider, media_type)')
      .or(`snapshot_a_id.eq.${snapshotAId},snapshot_b_id.eq.${snapshotAId}`)
      .order('created_at', { ascending: false }),
    supabase
      .from('tests')
      .select('id, track_id, snapshot_a_id, snapshot_b_id, clips(id, label, source_url, provider, media_type)')
      .or(`snapshot_a_id.eq.${snapshotBId},snapshot_b_id.eq.${snapshotBId}`)
      .order('created_at', { ascending: false }),
  ])

  const pairs = findSharedClips(
    (rawTestsA ?? []) as TestWithClips[],
    snapshotAId,
    (rawTestsB ?? []) as TestWithClips[],
    snapshotBId,
  )

  if (pairs.length === 0) {
    return NextResponse.json([])
  }

  const trackIds = pairs.map(p => p.trackId)

  // Check for existing cross-check tests between these two snapshots (either direction)
  const [{ data: existingAB }, { data: existingBA }, { data: tracks }] =
    await Promise.all([
      supabase
        .from('tests')
        .select('id, track_id')
        .in('track_id', trackIds)
        .eq('snapshot_a_id', snapshotAId)
        .eq('snapshot_b_id', snapshotBId),
      supabase
        .from('tests')
        .select('id, track_id')
        .in('track_id', trackIds)
        .eq('snapshot_a_id', snapshotBId)
        .eq('snapshot_b_id', snapshotAId),
      supabase
        .from('tracks')
        .select('id, artist, title, album')
        .in('id', trackIds),
    ])

  const existingByTrack = new Map<string, string>()
  for (const t of [...(existingAB ?? []), ...(existingBA ?? [])]) {
    existingByTrack.set(t.track_id, t.id)
  }

  const trackMap = new Map((tracks ?? []).map(t => [t.id, t]))

  const result = pairs.map(pair => ({
    trackId:          pair.trackId,
    track:            trackMap.get(pair.trackId) ?? null,
    clipForSnapshotA: pair.clipForSnapshotA,
    clipForSnapshotB: pair.clipForSnapshotB,
    existingTestId:   existingByTrack.get(pair.trackId) ?? null,
  }))

  return NextResponse.json(result)
}
