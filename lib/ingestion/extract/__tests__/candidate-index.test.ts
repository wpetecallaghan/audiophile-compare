import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm as rmDir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildCandidateIndex,
  isPostAccountedFor,
  isReplyToBrokenCandidate,
  findOpenCandidateByPostUrl,
  findOpenCandidateByCreatorLabel,
  getOpenCandidatesForCreator,
  getAllCandidatesForCreator,
  getAllOpenCandidates,
  saveCandidate,
  sweepExpiredCandidates,
} from '../candidate-index'
import { writeCandidate, findExistingCandidate, type Candidate } from '../candidate'

function candidate(sourceRef: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    created_at: '2024-01-01T00:00:00Z',
    payload: { source_ref: sourceRef, author: { forum_username: 'Charlie1' } },
    issues: [],
    contributing_posts: [`https://forum.example/${sourceRef}`],
    forum_labels: ['A', 'B'],
    ...overrides,
  }
}

describe('candidate-index', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'candidate-index-test-'))
  })

  afterEach(async () => {
    await rmDir(baseDir, { recursive: true, force: true })
  })

  describe('buildCandidateIndex', () => {
    it('is empty when no candidates exist', async () => {
      const index = await buildCandidateIndex(baseDir)
      expect(index.candidatesByRef.size).toBe(0)
      expect(index.accountedForPostUrls.size).toBe(0)
    })

    it('accounts for every post_url across every status folder, not just open ones', async () => {
      await writeCandidate(baseDir, 'pending', candidate('t:post-1:pair-1'))
      await writeCandidate(
        baseDir,
        'approved',
        candidate('t:post-2:pair-1', {
          contributing_posts: ['https://forum.example/t:post-2:pair-1'],
          payload: {
            source_ref: 't:post-2:pair-1',
            author: { forum_username: 'Charlie1' },
            before_is_a: true,
          },
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      expect(isPostAccountedFor(index, 'https://forum.example/t:post-1:pair-1')).toBe(true)
      expect(isPostAccountedFor(index, 'https://forum.example/t:post-2:pair-1')).toBe(true)
    })

    it('never treats an empty post_url as accounted for', async () => {
      await writeCandidate(
        baseDir,
        'needs_review',
        candidate('t:unresolvable-abc:pair-1', { contributing_posts: [''] }),
      )

      const index = await buildCandidateIndex(baseDir)
      expect(isPostAccountedFor(index, '')).toBe(false)
      expect(index.accountedForPostUrls.has('')).toBe(false)
    })

    it('only offers a not-yet-revealed candidate as an open match by post_url', async () => {
      await writeCandidate(baseDir, 'pending', candidate('t:post-1:pair-1'))

      const index = await buildCandidateIndex(baseDir)
      expect(findOpenCandidateByPostUrl(index, 'https://forum.example/t:post-1:pair-1')).not.toBeNull()
    })

    it('never offers a revealed candidate as an open match by post_url, even though it is still accounted for', async () => {
      const revealed = candidate('t:post-1:pair-1', {
        payload: {
          source_ref: 't:post-1:pair-1',
          author: { forum_username: 'Charlie1' },
          before_is_a: true,
        },
      })
      await writeCandidate(baseDir, 'ready', revealed)

      const index = await buildCandidateIndex(baseDir)
      expect(findOpenCandidateByPostUrl(index, 'https://forum.example/t:post-1:pair-1')).toBeNull()
      expect(isPostAccountedFor(index, 'https://forum.example/t:post-1:pair-1')).toBe(true)
    })

    it('never offers an approved/ingested/expired/broken candidate as an open match, even if unrevealed', async () => {
      // Contrived (approved should always be revealed in practice), but
      // confirms protected-status exclusion is independent of isRevealed.
      await writeCandidate(baseDir, 'approved', candidate('t:post-1:pair-1'))
      await writeCandidate(
        baseDir,
        'broken',
        candidate('t:post-2:pair-1', { payload: { source_ref: 't:post-2:pair-1', author: { forum_username: 'Charlie1' } } }),
      )

      const index = await buildCandidateIndex(baseDir)
      expect(findOpenCandidateByPostUrl(index, 'https://forum.example/t:post-1:pair-1')).toBeNull()
      expect(findOpenCandidateByPostUrl(index, 'https://forum.example/t:post-2:pair-1')).toBeNull()
      // Still accounted for in the skip-set, even though it's not an open match target.
      expect(isPostAccountedFor(index, 'https://forum.example/t:post-2:pair-1')).toBe(true)
    })

    it('resolves the bare-label fallback scoped per creator', async () => {
      await writeCandidate(
        baseDir,
        'pending',
        candidate('t:post-1:pair-1', { forum_labels: ['1153', '1155'] }),
      )

      const index = await buildCandidateIndex(baseDir)
      expect(findOpenCandidateByCreatorLabel(index, 'Charlie1', '1153')).not.toBeNull()
      expect(findOpenCandidateByCreatorLabel(index, 'Charlie1', '1155')).not.toBeNull()
      expect(findOpenCandidateByCreatorLabel(index, 'SomeoneElse', '1153')).toBeNull()
    })

    it('also resolves a composite label echoing candidateSummary\'s own "1/2" format (found in decision 15\'s real trial run)', async () => {
      await writeCandidate(baseDir, 'pending', candidate('t:post-1:pair-1', { forum_labels: ['1', '2'] }))

      const index = await buildCandidateIndex(baseDir)
      expect(findOpenCandidateByCreatorLabel(index, 'Charlie1', '1/2')?.payload.source_ref).toBe(
        't:post-1:pair-1',
      )
      expect(findOpenCandidateByCreatorLabel(index, 'Charlie1', '1 vs 2')?.payload.source_ref).toBe(
        't:post-1:pair-1',
      )
    })

    it('distinguishes open-candidates-for-creator from all-candidates-for-creator', async () => {
      await writeCandidate(baseDir, 'pending', candidate('t:post-1:pair-1'))
      await writeCandidate(
        baseDir,
        'ingested_production',
        candidate('t:post-2:pair-1', {
          payload: {
            source_ref: 't:post-2:pair-1',
            author: { forum_username: 'Charlie1' },
            before_is_a: true,
          },
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      expect(getOpenCandidatesForCreator(index, 'Charlie1')).toHaveLength(1)
      expect(getAllCandidatesForCreator(index, 'Charlie1')).toHaveLength(2)
    })

    it('getAllOpenCandidates spans every creator, not just one', async () => {
      await writeCandidate(
        baseDir,
        'pending',
        candidate('t:post-1:pair-1', { payload: { source_ref: 't:post-1:pair-1', author: { forum_username: 'Charlie1' } } }),
      )
      await writeCandidate(
        baseDir,
        'pending',
        candidate('t:post-2:pair-1', { payload: { source_ref: 't:post-2:pair-1', author: { forum_username: 'Spannko' } } }),
      )
      await writeCandidate(
        baseDir,
        'ready',
        candidate('t:post-3:pair-1', {
          payload: {
            source_ref: 't:post-3:pair-1',
            author: { forum_username: 'Spannko' },
            before_is_a: true,
          },
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      const open = getAllOpenCandidates(index)
      expect(open).toHaveLength(2)
      expect(open.map((c) => c.payload.source_ref).sort()).toEqual([
        't:post-1:pair-1',
        't:post-2:pair-1',
      ])
    })
  })

  describe('isReplyToBrokenCandidate', () => {
    it('is true when the quoted post belongs to a broken candidate', async () => {
      await writeCandidate(
        baseDir,
        'broken',
        candidate('t:post-1:pair-1', {
          contributing_posts: ['https://forum.example/t:post-1:pair-1'],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      expect(isReplyToBrokenCandidate(index, 'https://forum.example/t:post-1:pair-1')).toBe(true)
    })

    it('is false when the quoted post belongs to a candidate that is not broken', async () => {
      await writeCandidate(baseDir, 'pending', candidate('t:post-1:pair-1'))

      const index = await buildCandidateIndex(baseDir)
      expect(isReplyToBrokenCandidate(index, 'https://forum.example/t:post-1:pair-1')).toBe(false)
    })

    it('is false when the quoted post is not accounted for by any candidate at all', async () => {
      const index = await buildCandidateIndex(baseDir)
      expect(isReplyToBrokenCandidate(index, 'https://forum.example/unknown-post')).toBe(false)
    })
  })

  describe('saveCandidate', () => {
    it('creates a brand-new candidate on disk and in the index', async () => {
      const index = await buildCandidateIndex(baseDir)
      await saveCandidate(index, baseDir, 'pending', candidate('t:post-1:pair-1'))

      await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
        status: 'pending',
      })
      expect(index.candidatesByRef.get('t:post-1:pair-1')?.status).toBe('pending')
    })

    it('moves a candidate between statuses, removing the old file and updating the index', async () => {
      const index = await buildCandidateIndex(baseDir)
      await saveCandidate(index, baseDir, 'pending', candidate('t:post-1:pair-1'))
      await saveCandidate(
        index,
        baseDir,
        'ready',
        candidate('t:post-1:pair-1', {
          payload: {
            source_ref: 't:post-1:pair-1',
            author: { forum_username: 'Charlie1' },
            before_is_a: true,
          },
        }),
      )

      const onDisk = await findExistingCandidate(baseDir, 't:post-1:pair-1')
      expect(onDisk?.status).toBe('ready')
      expect(index.candidatesByRef.get('t:post-1:pair-1')?.status).toBe('ready')
      // Closing it (before_is_a now set) should also drop it from the open maps.
      expect(findOpenCandidateByPostUrl(index, 'https://forum.example/t:post-1:pair-1')).toBeNull()
    })

    it('refuses to move a candidate out of a protected status', async () => {
      const index = await buildCandidateIndex(baseDir)
      await saveCandidate(index, baseDir, 'approved', candidate('t:post-1:pair-1'))

      await expect(
        saveCandidate(index, baseDir, 'pending', candidate('t:post-1:pair-1')),
      ).rejects.toThrow(/refusing to move/)
    })

    it('allows re-saving a candidate at the same protected status (no-op move)', async () => {
      const index = await buildCandidateIndex(baseDir)
      await saveCandidate(index, baseDir, 'approved', candidate('t:post-1:pair-1'))

      await expect(
        saveCandidate(index, baseDir, 'approved', candidate('t:post-1:pair-1')),
      ).resolves.toBeUndefined()
    })
  })

  describe('sweepExpiredCandidates', () => {
    it('expires an open candidate whose test-defining post is more than 21 days before the clock', async () => {
      const index = await buildCandidateIndex(baseDir)
      await saveCandidate(
        index,
        baseDir,
        'pending',
        candidate('t:post-1:pair-1', { created_at: '2024-01-01T00:00:00Z' }),
      )

      await sweepExpiredCandidates(index, baseDir, '2024-01-23T00:00:00Z') // 22 days later

      expect(index.candidatesByRef.get('t:post-1:pair-1')?.status).toBe('expired')
      await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
        status: 'expired',
      })
    })

    it('does not expire a candidate within the 21-day window', async () => {
      const index = await buildCandidateIndex(baseDir)
      await saveCandidate(
        index,
        baseDir,
        'pending',
        candidate('t:post-1:pair-1', { created_at: '2024-01-01T00:00:00Z' }),
      )

      await sweepExpiredCandidates(index, baseDir, '2024-01-10T00:00:00Z') // 9 days later

      expect(index.candidatesByRef.get('t:post-1:pair-1')?.status).toBe('pending')
    })

    it('never expires an already-revealed candidate', async () => {
      const index = await buildCandidateIndex(baseDir)
      await saveCandidate(
        index,
        baseDir,
        'ready',
        candidate('t:post-1:pair-1', {
          created_at: '2024-01-01T00:00:00Z',
          payload: {
            source_ref: 't:post-1:pair-1',
            author: { forum_username: 'Charlie1' },
            before_is_a: true,
          },
        }),
      )

      await sweepExpiredCandidates(index, baseDir, '2024-06-01T00:00:00Z')

      expect(index.candidatesByRef.get('t:post-1:pair-1')?.status).toBe('ready')
    })

    it('never expires a candidate with no resolvable created_at', async () => {
      const index = await buildCandidateIndex(baseDir)
      await saveCandidate(
        index,
        baseDir,
        'needs_review',
        candidate('t:post-1:pair-1', { created_at: '' }),
      )

      await sweepExpiredCandidates(index, baseDir, '2024-06-01T00:00:00Z')

      expect(index.candidatesByRef.get('t:post-1:pair-1')?.status).toBe('needs_review')
    })

    it('never touches an already-expired or otherwise protected candidate', async () => {
      const index = await buildCandidateIndex(baseDir)
      await saveCandidate(
        index,
        baseDir,
        'expired',
        candidate('t:post-1:pair-1', { created_at: '2024-01-01T00:00:00Z' }),
      )

      await expect(
        sweepExpiredCandidates(index, baseDir, '2024-06-01T00:00:00Z'),
      ).resolves.toBeUndefined()
      expect(index.candidatesByRef.get('t:post-1:pair-1')?.status).toBe('expired')
    })
  })
})
