import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm as rmDir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isProtectedStatus,
  isRevealed,
  findExistingCandidate,
  writeCandidate,
  deleteCandidate,
  moveCandidate,
  readAllCandidates,
  type Candidate,
} from '../candidate'

function candidate(sourceRef: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    created_at: '2024-01-01T00:00:00Z',
    payload: { source_ref: sourceRef },
    issues: [],
    contributing_posts: [`https://forum.example/${sourceRef}`],
    forum_labels: ['A', 'B'],
    ...overrides,
  }
}

describe('isProtectedStatus', () => {
  it('protects approved, both ingested stages, expired, and broken', () => {
    expect(isProtectedStatus('approved')).toBe(true)
    expect(isProtectedStatus('ingested_staging')).toBe(true)
    expect(isProtectedStatus('ingested_production')).toBe(true)
    expect(isProtectedStatus('expired')).toBe(true)
    expect(isProtectedStatus('broken')).toBe(true)
  })

  it('does not protect pending, needs_review, or ready', () => {
    expect(isProtectedStatus('pending')).toBe(false)
    expect(isProtectedStatus('needs_review')).toBe(false)
    expect(isProtectedStatus('ready')).toBe(false)
  })
})

describe('isRevealed', () => {
  it('is false when before_is_a is not yet set', () => {
    expect(isRevealed(candidate('t:post-1:pair-1'))).toBe(false)
  })

  it('is true once before_is_a is populated, regardless of its value', () => {
    expect(
      isRevealed(candidate('t:post-1:pair-1', { payload: { source_ref: 't:post-1:pair-1', before_is_a: false } })),
    ).toBe(true)
    expect(
      isRevealed(candidate('t:post-1:pair-1', { payload: { source_ref: 't:post-1:pair-1', before_is_a: true } })),
    ).toBe(true)
  })
})

describe('candidate file storage', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'candidate-test-'))
  })

  afterEach(async () => {
    await rmDir(baseDir, { recursive: true, force: true })
  })

  it('returns null when a source_ref has no file anywhere', async () => {
    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toBeNull()
  })

  it('writes and finds a candidate by source_ref', async () => {
    const c = candidate('t:post-1:pair-1')
    await writeCandidate(baseDir, 'pending', c)

    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toEqual({
      status: 'pending',
      candidate: c,
    })
  })

  it('writes to the nested ingested/staging and ingested/production folders correctly', async () => {
    const staging = candidate('t:post-1:pair-1')
    const production = candidate('t:post-2:pair-1')
    await writeCandidate(baseDir, 'ingested_staging', staging)
    await writeCandidate(baseDir, 'ingested_production', production)

    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toEqual({
      status: 'ingested_staging',
      candidate: staging,
    })
    await expect(findExistingCandidate(baseDir, 't:post-2:pair-1')).resolves.toEqual({
      status: 'ingested_production',
      candidate: production,
    })
  })

  it('throws when writing a candidate with no source_ref', async () => {
    const c = candidate('irrelevant', { payload: {} })
    await expect(writeCandidate(baseDir, 'pending', c)).rejects.toThrow('source_ref is required')
  })

  it('moves a candidate from one status folder to another', async () => {
    const c = candidate('t:post-1:pair-1')
    await writeCandidate(baseDir, 'pending', c)

    await moveCandidate(baseDir, 't:post-1:pair-1', 'pending', 'ready')

    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toEqual({
      status: 'ready',
      candidate: c,
    })
  })

  it('removes the old file after a move — a candidate never exists in two folders at once', async () => {
    const c = candidate('t:post-1:pair-1')
    await writeCandidate(baseDir, 'pending', c)
    await moveCandidate(baseDir, 't:post-1:pair-1', 'pending', 'ready')

    const all = await readAllCandidates(baseDir)
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe('ready')
  })

  it('deletes a candidate file at a given status', async () => {
    await writeCandidate(baseDir, 'pending', candidate('t:post-1:pair-1'))
    await deleteCandidate(baseDir, 'pending', 't:post-1:pair-1')

    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toBeNull()
  })

  it('is a no-op deleting a candidate that does not exist', async () => {
    await expect(deleteCandidate(baseDir, 'pending', 't:post-1:pair-1')).resolves.toBeUndefined()
  })

  it('is a no-op moving a candidate that does not exist at the source', async () => {
    await expect(moveCandidate(baseDir, 't:post-1:pair-1', 'pending', 'ready')).resolves.toBeUndefined()
    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toBeNull()
  })

  it('reads every candidate across all eight status folders', async () => {
    await writeCandidate(baseDir, 'pending', candidate('t:post-1:pair-1'))
    await writeCandidate(baseDir, 'needs_review', candidate('t:post-2:pair-1'))
    await writeCandidate(baseDir, 'ready', candidate('t:post-3:pair-1'))
    await writeCandidate(baseDir, 'approved', candidate('t:post-4:pair-1'))
    await writeCandidate(baseDir, 'ingested_staging', candidate('t:post-5:pair-1'))
    await writeCandidate(baseDir, 'ingested_production', candidate('t:post-6:pair-1'))
    await writeCandidate(baseDir, 'expired', candidate('t:post-7:pair-1'))
    await writeCandidate(baseDir, 'broken', candidate('t:post-8:pair-1'))

    const all = await readAllCandidates(baseDir)
    expect(all).toHaveLength(8)
    expect(all.map((r) => r.status).sort()).toEqual(
      [
        'approved',
        'broken',
        'expired',
        'ingested_production',
        'ingested_staging',
        'needs_review',
        'pending',
        'ready',
      ].sort(),
    )
  })

  it('returns an empty array when no candidates exist at all', async () => {
    await expect(readAllCandidates(baseDir)).resolves.toEqual([])
  })
})
