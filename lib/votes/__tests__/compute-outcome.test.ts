// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeOutcome } from '../compute-outcome'
import type { OutcomeTestInput } from '../compute-outcome'

// --- Fixtures ---

const CLIP_A_ID    = 'clip-a'
const CLIP_B_ID    = 'clip-b'
const SNAPSHOT_A   = 'snapshot-a'
const SNAPSHOT_B   = 'snapshot-b'
const TEST_ID      = 'test-1'

function makeTest(overrides: Partial<OutcomeTestInput> = {}): OutcomeTestInput {
  return {
    id: TEST_ID,
    status: 'revealed',
    snapshot_a_id: SNAPSHOT_A,
    snapshot_b_id: SNAPSHOT_B,
    clips: [
      { id: CLIP_A_ID, label: 'A' },
      { id: CLIP_B_ID, label: 'B' },
    ],
    ...overrides,
  }
}

/** Build a votesByTest map with the given chosen_clip_ids for TEST_ID. */
function makeVotes(
  ...clipIds: string[]
): Map<string, { chosen_clip_id: string }[]> {
  return new Map([[TEST_ID, clipIds.map(id => ({ chosen_clip_id: id }))]])
}

// --- Tests ---

describe('computeOutcome', () => {
  it('returns "open" when the test has not been revealed', () => {
    expect(
      computeOutcome(makeTest({ status: 'open' }), SNAPSHOT_A, new Map()),
    ).toBe('open')
  })

  it('returns "no-votes" when the test is revealed but has no votes in the map', () => {
    expect(computeOutcome(makeTest(), SNAPSHOT_A, new Map())).toBe('no-votes')
  })

  it('returns "no-votes" when the clips array is empty', () => {
    expect(
      computeOutcome(
        makeTest({ clips: [] }),
        SNAPSHOT_A,
        makeVotes(CLIP_A_ID),
      ),
    ).toBe('no-votes')
  })

  it('returns "win" when snapshot is on side A and clip A has more votes', () => {
    expect(
      computeOutcome(
        makeTest(),
        SNAPSHOT_A,
        makeVotes(CLIP_A_ID, CLIP_A_ID, CLIP_B_ID), // 2 vs 1
      ),
    ).toBe('win')
  })

  it('returns "loss" when snapshot is on side A and clip B has more votes', () => {
    expect(
      computeOutcome(
        makeTest(),
        SNAPSHOT_A,
        makeVotes(CLIP_B_ID, CLIP_B_ID, CLIP_A_ID), // 1 vs 2
      ),
    ).toBe('loss')
  })

  it('returns "win" when snapshot is on side B and clip B has more votes', () => {
    expect(
      computeOutcome(
        makeTest(),
        SNAPSHOT_B,
        makeVotes(CLIP_B_ID, CLIP_B_ID, CLIP_A_ID), // B: 2, A: 1 → snapshot on B wins
      ),
    ).toBe('win')
  })

  it('returns "loss" when snapshot is on side B and clip A has more votes', () => {
    expect(
      computeOutcome(
        makeTest(),
        SNAPSHOT_B,
        makeVotes(CLIP_A_ID, CLIP_A_ID, CLIP_B_ID), // A: 2, B: 1 → snapshot on B loses
      ),
    ).toBe('loss')
  })

  it('returns "draw" when votes are exactly equal on both sides', () => {
    expect(
      computeOutcome(
        makeTest(),
        SNAPSHOT_A,
        makeVotes(CLIP_A_ID, CLIP_B_ID), // 1 vs 1
      ),
    ).toBe('draw')
  })
})
