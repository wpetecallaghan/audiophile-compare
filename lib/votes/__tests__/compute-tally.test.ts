// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeTally } from '../compute-tally'
import type { RawVoteRow } from '../compute-tally'

const CLIP_A = 'clip-a'
const CLIP_B = 'clip-b'

const tune = { id: 'tech-tune', name: 'Tune Method', is_other: false, sort_order: 1 }
const prat = { id: 'tech-prat', name: 'PRaT',        is_other: false, sort_order: 2 }
const tonal = { id: 'tech-tonal', name: 'Tonal',     is_other: false, sort_order: 3 }
const other = { id: 'tech-other', name: 'Other',     is_other: true,  sort_order: 6 }

function vote(
  technique: typeof tune,
  clipId: string,
  opts: { other_description?: string; observation?: string } = {},
): RawVoteRow {
  return {
    chosen_clip_id: clipId,
    other_description: opts.other_description ?? null,
    observation: opts.observation ?? null,
    technique,
  }
}

describe('computeTally', () => {
  describe('Empty input', () => {
    it('returns empty curated and others arrays when there are no votes', () => {
      const result = computeTally([], CLIP_A, CLIP_B)
      expect(result.curated).toHaveLength(0)
      expect(result.others).toHaveLength(0)
      expect(result.divergent).toBe(false)
    })
  })

  describe('Single technique', () => {
    it('returns 100% for A when all votes chose clip A', () => {
      const votes = [vote(tune, CLIP_A), vote(tune, CLIP_A), vote(tune, CLIP_A)]
      const { curated } = computeTally(votes, CLIP_A, CLIP_B)

      expect(curated).toHaveLength(1)
      expect(curated[0].clipAVotes).toBe(3)
      expect(curated[0].clipBVotes).toBe(0)
      expect(curated[0].clipAPercent).toBe(100)
      expect(curated[0].clipBPercent).toBe(0)
      expect(curated[0].winnerClipId).toBe(CLIP_A)
    })

    it('returns 100% for B when all votes chose clip B', () => {
      const votes = [vote(tune, CLIP_B), vote(tune, CLIP_B)]
      const { curated } = computeTally(votes, CLIP_A, CLIP_B)

      expect(curated[0].winnerClipId).toBe(CLIP_B)
      expect(curated[0].clipBPercent).toBe(100)
      expect(curated[0].clipAPercent).toBe(0)
    })

    it('returns 50/50 and null winner when votes are exactly tied', () => {
      const votes = [vote(tune, CLIP_A), vote(tune, CLIP_B)]
      const { curated } = computeTally(votes, CLIP_A, CLIP_B)

      expect(curated[0].clipAPercent).toBe(50)
      expect(curated[0].clipBPercent).toBe(50)
      expect(curated[0].winnerClipId).toBeNull()
    })

    it('rounds percentages correctly (2 of 3 votes = 67%)', () => {
      const votes = [vote(tune, CLIP_A), vote(tune, CLIP_A), vote(tune, CLIP_B)]
      const { curated } = computeTally(votes, CLIP_A, CLIP_B)

      expect(curated[0].clipAPercent).toBe(67)
      expect(curated[0].clipBPercent).toBe(33) // 100 - 67, avoids double-rounding
    })

    it('reports the correct total vote count', () => {
      const votes = [vote(tune, CLIP_A), vote(tune, CLIP_B), vote(tune, CLIP_A)]
      const { curated } = computeTally(votes, CLIP_A, CLIP_B)
      expect(curated[0].total).toBe(3)
    })
  })

  describe('Multiple techniques', () => {
    it('groups votes by technique correctly', () => {
      const votes = [
        vote(tune,  CLIP_A),
        vote(tune,  CLIP_A),
        vote(prat,  CLIP_B),
        vote(prat,  CLIP_B),
        vote(prat,  CLIP_B),
      ]
      const { curated } = computeTally(votes, CLIP_A, CLIP_B)

      expect(curated).toHaveLength(2)
      expect(curated[0].techniqueName).toBe('Tune Method')
      expect(curated[0].clipAVotes).toBe(2)
      expect(curated[1].techniqueName).toBe('PRaT')
      expect(curated[1].clipBVotes).toBe(3)
    })

    it('sorts curated results by sort_order', () => {
      // Supply votes out of sort_order sequence
      const votes = [vote(prat, CLIP_A), vote(tune, CLIP_B), vote(tonal, CLIP_A)]
      const { curated } = computeTally(votes, CLIP_A, CLIP_B)

      expect(curated.map(r => r.techniqueName)).toEqual([
        'Tune Method',
        'PRaT',
        'Tonal',
      ])
    })
  })

  describe('Divergence detection', () => {
    it('is false when all techniques agree on the winner', () => {
      const votes = [vote(tune, CLIP_A), vote(prat, CLIP_A)]
      const { divergent } = computeTally(votes, CLIP_A, CLIP_B)
      expect(divergent).toBe(false)
    })

    it('is true when techniques disagree on the winner', () => {
      const votes = [vote(tune, CLIP_A), vote(prat, CLIP_B)]
      const { divergent } = computeTally(votes, CLIP_A, CLIP_B)
      expect(divergent).toBe(true)
    })

    it('is false when some techniques are tied (no clear winner to disagree)', () => {
      // tune tied, prat prefers A — no disagreement because tied has no winner
      const votes = [
        vote(tune, CLIP_A),
        vote(tune, CLIP_B),
        vote(prat, CLIP_A),
      ]
      const { divergent } = computeTally(votes, CLIP_A, CLIP_B)
      expect(divergent).toBe(false)
    })
  })

  describe('Other technique', () => {
    it('puts Other votes into the others array, not curated', () => {
      const votes = [vote(other, CLIP_A, { other_description: 'Detail retrieval' })]
      const { curated, others } = computeTally(votes, CLIP_A, CLIP_B)

      expect(curated).toHaveLength(0)
      expect(others).toHaveLength(1)
    })

    it('records the chosen clip id, description, and observation for Other votes', () => {
      const votes = [
        vote(other, CLIP_B, {
          other_description: 'Low-level detail',
          observation: 'Clip B resolved more micro-detail',
        }),
      ]
      const { others } = computeTally(votes, CLIP_A, CLIP_B)

      expect(others[0].chosenClipId).toBe(CLIP_B)
      expect(others[0].description).toBe('Low-level detail')
      expect(others[0].observation).toBe('Clip B resolved more micro-detail')
    })

    it('sets observation to null when not provided', () => {
      const votes = [vote(other, CLIP_A, { other_description: 'Speed' })]
      const { others } = computeTally(votes, CLIP_A, CLIP_B)
      expect(others[0].observation).toBeNull()
    })

    it('does not affect divergence calculation', () => {
      const votes = [
        vote(tune,  CLIP_A),
        vote(prat,  CLIP_A),
        vote(other, CLIP_B, { other_description: 'Some other criterion' }),
      ]
      const { divergent } = computeTally(votes, CLIP_A, CLIP_B)
      expect(divergent).toBe(false)
    })
  })

  describe('Supabase join format', () => {
    it('handles technique returned as a single-element array', () => {
      const votes: RawVoteRow[] = [
        {
          chosen_clip_id: CLIP_A,
          other_description: null,
          observation: null,
          technique: [tune], // array form
        },
      ]
      const { curated } = computeTally(votes, CLIP_A, CLIP_B)
      expect(curated).toHaveLength(1)
      expect(curated[0].techniqueName).toBe('Tune Method')
    })
  })
})
