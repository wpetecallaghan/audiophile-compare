// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { findSharedClips } from '../find-shared-clips'
import type { TestWithClips } from '../find-shared-clips'
import { PROVIDER_DIRECT, MEDIA_TYPE_AUDIO } from '../detect-provider'

// --- Fixtures ---

const SNAP_A  = 'snapshot-a'
const SNAP_B  = 'snapshot-b'
const OTHER   = 'snapshot-other'
const TRACK_1 = 'track-1'
const TRACK_2 = 'track-2'

function makeClips(aUrl: string, bUrl: string): TestWithClips['clips'] {
  return [
    { id: 'clip-a', label: 'A', source_url: aUrl, provider: PROVIDER_DIRECT, media_type: MEDIA_TYPE_AUDIO },
    { id: 'clip-b', label: 'B', source_url: bUrl, provider: PROVIDER_DIRECT, media_type: MEDIA_TYPE_AUDIO },
  ]
}

// SNAP_A appears as side A (its recording is Clip A)
const testSnapAOnSideA: TestWithClips = {
  id: 'test-1', track_id: TRACK_1,
  snapshot_a_id: SNAP_A, snapshot_b_id: OTHER,
  clips: makeClips('https://example.com/snap-a-track1.mp3', 'https://example.com/other-track1.mp3'),
}

// SNAP_A appears as side B (its recording is Clip B)
const testSnapAOnSideB: TestWithClips = {
  id: 'test-2', track_id: TRACK_1,
  snapshot_a_id: OTHER, snapshot_b_id: SNAP_A,
  clips: makeClips('https://example.com/other2-track1.mp3', 'https://example.com/snap-a-track1-v2.mp3'),
}

// SNAP_B appears as side A
const testSnapBOnSideA: TestWithClips = {
  id: 'test-3', track_id: TRACK_1,
  snapshot_a_id: SNAP_B, snapshot_b_id: OTHER,
  clips: makeClips('https://example.com/snap-b-track1.mp3', 'https://example.com/other3-track1.mp3'),
}

// SNAP_B appears as side B
const testSnapBOnSideB: TestWithClips = {
  id: 'test-4', track_id: TRACK_1,
  snapshot_a_id: OTHER, snapshot_b_id: SNAP_B,
  clips: makeClips('https://example.com/other4-track1.mp3', 'https://example.com/snap-b-track1-v2.mp3'),
}

// TRACK_2 variants
const testSnapATrack2: TestWithClips = {
  id: 'test-5', track_id: TRACK_2,
  snapshot_a_id: SNAP_A, snapshot_b_id: OTHER,
  clips: makeClips('https://example.com/snap-a-track2.mp3', 'https://example.com/other-track2.mp3'),
}

const testSnapBTrack2: TestWithClips = {
  id: 'test-6', track_id: TRACK_2,
  snapshot_a_id: SNAP_B, snapshot_b_id: OTHER,
  clips: makeClips('https://example.com/snap-b-track2.mp3', 'https://example.com/other5-track2.mp3'),
}

// --- Tests ---

describe('findSharedClips', () => {
  it('returns empty array when testsForSnapshotA is empty', () => {
    expect(findSharedClips([], SNAP_A, [testSnapBOnSideA], SNAP_B)).toEqual([])
  })

  it('returns empty array when testsForSnapshotB is empty', () => {
    expect(findSharedClips([testSnapAOnSideA], SNAP_A, [], SNAP_B)).toEqual([])
  })

  it('returns empty array when no track appears in both lists', () => {
    const testSnapAOtherTrack: TestWithClips = {
      ...testSnapAOnSideA, track_id: 'track-99',
    }
    expect(
      findSharedClips([testSnapAOtherTrack], SNAP_A, [testSnapBOnSideA], SNAP_B),
    ).toEqual([])
  })

  it('picks clip A when snapshot appears as side A in its test', () => {
    // SNAP_A on side A → its clip is label 'A'
    // SNAP_B on side A → its clip is label 'A'
    const result = findSharedClips([testSnapAOnSideA], SNAP_A, [testSnapBOnSideA], SNAP_B)
    expect(result).toHaveLength(1)
    expect(result[0].clipForSnapshotA.source_url).toBe('https://example.com/snap-a-track1.mp3')
    expect(result[0].clipForSnapshotB.source_url).toBe('https://example.com/snap-b-track1.mp3')
  })

  it('picks clip B when snapshot appears as side B in its test', () => {
    // SNAP_A on side B → its clip is label 'B'
    // SNAP_B on side B → its clip is label 'B'
    const result = findSharedClips([testSnapAOnSideB], SNAP_A, [testSnapBOnSideB], SNAP_B)
    expect(result).toHaveLength(1)
    expect(result[0].clipForSnapshotA.source_url).toBe('https://example.com/snap-a-track1-v2.mp3')
    expect(result[0].clipForSnapshotB.source_url).toBe('https://example.com/snap-b-track1-v2.mp3')
  })

  it('handles mixed sides: snapshot A on side A, snapshot B on side B', () => {
    const result = findSharedClips([testSnapAOnSideA], SNAP_A, [testSnapBOnSideB], SNAP_B)
    expect(result).toHaveLength(1)
    expect(result[0].clipForSnapshotA.source_url).toBe('https://example.com/snap-a-track1.mp3')
    expect(result[0].clipForSnapshotB.source_url).toBe('https://example.com/snap-b-track1-v2.mp3')
  })

  it('handles mixed sides: snapshot A on side B, snapshot B on side A', () => {
    const result = findSharedClips([testSnapAOnSideB], SNAP_A, [testSnapBOnSideA], SNAP_B)
    expect(result).toHaveLength(1)
    expect(result[0].clipForSnapshotA.source_url).toBe('https://example.com/snap-a-track1-v2.mp3')
    expect(result[0].clipForSnapshotB.source_url).toBe('https://example.com/snap-b-track1.mp3')
  })

  it('returns all shared tracks when multiple tracks match', () => {
    const result = findSharedClips(
      [testSnapAOnSideA, testSnapATrack2],
      SNAP_A,
      [testSnapBOnSideA, testSnapBTrack2],
      SNAP_B,
    )
    expect(result).toHaveLength(2)
    const trackIds = result.map(r => r.trackId).sort()
    expect(trackIds).toEqual([TRACK_1, TRACK_2].sort())
  })

  it('uses the first (most recent) clip when the same snapshot appears in multiple tests for a track', () => {
    const olderTest: TestWithClips = {
      id: 'test-older', track_id: TRACK_1,
      snapshot_a_id: SNAP_A, snapshot_b_id: OTHER,
      clips: makeClips('https://example.com/snap-a-old.mp3', 'https://example.com/other-old.mp3'),
    }
    // testSnapAOnSideA is more recent (passed first)
    const result = findSharedClips([testSnapAOnSideA, olderTest], SNAP_A, [testSnapBOnSideA], SNAP_B)
    expect(result).toHaveLength(1)
    // Should use the first list entry (most recent), not the older one
    expect(result[0].clipForSnapshotA.source_url).toBe('https://example.com/snap-a-track1.mp3')
  })
})
