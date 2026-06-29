export type Outcome = 'win' | 'loss' | 'draw' | 'open' | 'no-votes'

export type OutcomeTestInput = {
  id: string
  status: string
  snapshot_a_id: string
  snapshot_b_id: string
  clips: { id: string; label: string }[]
}

/**
 * Determines the win/loss outcome for a given snapshot in a test.
 *
 * - 'open'     — test has not been revealed yet
 * - 'no-votes' — revealed but no curated votes recorded
 * - 'win'      — the snapshot's side received more curated votes
 * - 'loss'     — the snapshot's side received fewer curated votes
 * - 'draw'     — equal curated votes on both sides
 *
 * `votesByTest` should contain only curated (non-Other) votes, pre-filtered
 * by the caller. `snapshot_a_id` maps to Clip A; `snapshot_b_id` to Clip B.
 */
export function computeOutcome(
  test: OutcomeTestInput,
  snapshotId: string,
  votesByTest: Map<string, { chosen_clip_id: string }[]>,
): Outcome {
  if (test.status !== 'revealed') return 'open'

  const votes = votesByTest.get(test.id) ?? []
  if (votes.length === 0) return 'no-votes'

  const clipA = test.clips.find(c => c.label === 'A')
  const clipB = test.clips.find(c => c.label === 'B')
  if (!clipA || !clipB) return 'no-votes'

  const aVotes = votes.filter(v => v.chosen_clip_id === clipA.id).length
  const bVotes = votes.filter(v => v.chosen_clip_id === clipB.id).length

  // snapshot_a_id → Clip A; snapshot_b_id → Clip B
  const isOnSideA = test.snapshot_a_id === snapshotId
  const snapshotVotes = isOnSideA ? aVotes : bVotes
  const otherVotes    = isOnSideA ? bVotes : aVotes

  if (snapshotVotes > otherVotes) return 'win'
  if (snapshotVotes < otherVotes) return 'loss'
  return 'draw'
}
