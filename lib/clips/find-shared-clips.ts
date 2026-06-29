/**
 * Finds tracks that appear in tests for both `snapshotAId` and `snapshotBId`,
 * returning the clip URL that was recorded for each snapshot on each shared track.
 *
 * Pass the test lists sorted most-recent-first. When a snapshot appears in
 * more than one test for the same track, the first entry (most recent) is used.
 */

export type TestWithClips = {
  id: string
  track_id: string
  snapshot_a_id: string
  snapshot_b_id: string
  clips: {
    id: string
    label: string        // 'A' | 'B'
    source_url: string
    provider: string
    media_type: string
  }[]
}

export type SharedClipEntry = {
  source_url: string
  provider: string
  media_type: string
}

export type SharedClipPair = {
  trackId: string
  clipForSnapshotA: SharedClipEntry
  clipForSnapshotB: SharedClipEntry
}

export function findSharedClips(
  testsForSnapshotA: TestWithClips[],
  snapshotAId: string,
  testsForSnapshotB: TestWithClips[],
  snapshotBId: string,
): SharedClipPair[] {
  // Build trackId → clip map for snapshot A
  // snapshot_a_id === snapshotAId means the recording is labelled 'A' in that test
  const clipsByTrackForA = new Map<string, SharedClipEntry>()
  for (const test of testsForSnapshotA) {
    if (clipsByTrackForA.has(test.track_id)) continue // first (most recent) wins
    const label = test.snapshot_a_id === snapshotAId ? 'A' : 'B'
    const clip = test.clips.find(c => c.label === label)
    if (!clip) continue
    clipsByTrackForA.set(test.track_id, {
      source_url: clip.source_url,
      provider:   clip.provider,
      media_type: clip.media_type,
    })
  }

  // Build trackId → clip map for snapshot B
  const clipsByTrackForB = new Map<string, SharedClipEntry>()
  for (const test of testsForSnapshotB) {
    if (clipsByTrackForB.has(test.track_id)) continue
    const label = test.snapshot_a_id === snapshotBId ? 'A' : 'B'
    const clip = test.clips.find(c => c.label === label)
    if (!clip) continue
    clipsByTrackForB.set(test.track_id, {
      source_url: clip.source_url,
      provider:   clip.provider,
      media_type: clip.media_type,
    })
  }

  // Intersection: tracks present in both maps
  const result: SharedClipPair[] = []
  for (const [trackId, clipA] of clipsByTrackForA) {
    const clipB = clipsByTrackForB.get(trackId)
    if (clipB) {
      result.push({ trackId, clipForSnapshotA: clipA, clipForSnapshotB: clipB })
    }
  }
  return result
}
