// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm as rmDir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitCandidate, commitEnvironment } from '../commit'
import { writeCandidate, findExistingCandidate, type Candidate } from '../extract/candidate'

const BASE_URL = 'https://staging.example.com'
const SECRET = 'test-secret'

function candidate(sourceRef: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    created_at: '2024-01-01T00:00:00Z',
    payload: { source_ref: sourceRef },
    issues: [],
    notes: [],
    contributing_posts: [`https://forum.example/${sourceRef}`],
    forum_labels: ['A', 'B'],
    ...overrides,
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('commitCandidate', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('POSTs the candidate payload with the ingest secret header', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ testId: 'test-1', alreadyImported: false }, 201),
    )

    const c = candidate('t:post-1:pair-1')
    await commitCandidate(BASE_URL, SECRET, c)

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/internal/ingest`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-ingest-secret': SECRET }),
        body: JSON.stringify(c.payload),
      }),
    )
  })

  it('returns testId/alreadyImported on a 201 (new) response', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ testId: 'test-1', alreadyImported: false }, 201),
    )

    await expect(commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))).resolves.toEqual({
      testId: 'test-1',
      alreadyImported: false,
    })
  })

  it('treats a 200 alreadyImported response as success, not an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ testId: 'test-1', alreadyImported: true }, 200),
    )

    await expect(commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))).resolves.toEqual({
      testId: 'test-1',
      alreadyImported: true,
    })
  })

  it('returns the real error message on a non-2xx response', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ error: 'source_ref is required' }, 400))

    await expect(commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))).resolves.toEqual({
      error: 'source_ref is required',
    })
  })

  it('falls back to an HTTP status message when a non-2xx response has no error field', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}, 500))

    await expect(commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))).resolves.toEqual({
      error: 'HTTP 500',
    })
  })
})

describe('commitEnvironment', () => {
  const originalFetch = global.fetch
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'commit-test-'))
    global.fetch = vi.fn()
  })

  afterEach(async () => {
    global.fetch = originalFetch
    await rmDir(baseDir, { recursive: true, force: true })
  })

  it('staging reads only from approved/ and moves successes to ingested/staging/, resolving the nested path correctly', async () => {
    await writeCandidate(baseDir, 'approved', candidate('t:post-1:pair-1'))
    await writeCandidate(baseDir, 'ready', candidate('t:post-2:pair-1')) // must be ignored
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ testId: 'test-1', alreadyImported: false }, 201))

    const result = await commitEnvironment(baseDir, BASE_URL, SECRET, 'staging')

    expect(result).toEqual({ committed: 1, failed: 0 })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
      status: 'ingested_staging',
    })
    await expect(findExistingCandidate(baseDir, 't:post-2:pair-1')).resolves.toMatchObject({
      status: 'ready',
    })
  })

  it('production reads only from ingested/staging/, never approved/, even when approved/ still has entries', async () => {
    await writeCandidate(baseDir, 'approved', candidate('t:post-1:pair-1')) // must be ignored
    await writeCandidate(baseDir, 'ingested_staging', candidate('t:post-2:pair-1'))
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ testId: 'test-2', alreadyImported: false }, 201))

    const result = await commitEnvironment(baseDir, BASE_URL, SECRET, 'production')

    expect(result).toEqual({ committed: 1, failed: 0 })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
      status: 'approved',
    })
    await expect(findExistingCandidate(baseDir, 't:post-2:pair-1')).resolves.toMatchObject({
      status: 'ingested_production',
    })
  })

  it('leaves a failed candidate in its source folder with the error appended to notes, never issues', async () => {
    await writeCandidate(baseDir, 'approved', candidate('t:post-1:pair-1'))
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ error: 'ingest failed' }, 500))

    const result = await commitEnvironment(baseDir, BASE_URL, SECRET, 'staging')

    expect(result).toEqual({ committed: 0, failed: 1 })
    const found = await findExistingCandidate(baseDir, 't:post-1:pair-1')
    expect(found?.status).toBe('approved')
    expect(found?.candidate.issues).toEqual([])
    expect(found?.candidate.notes).toEqual(
      expect.arrayContaining([expect.stringContaining('ingest failed')]),
    )
  })

  it('retries a previously-failed candidate on the next run rather than losing it', async () => {
    await writeCandidate(baseDir, 'approved', candidate('t:post-1:pair-1'))
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ error: 'ingest failed' }, 500))
    await commitEnvironment(baseDir, BASE_URL, SECRET, 'staging')

    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ testId: 'test-1', alreadyImported: false }, 201))
    const result = await commitEnvironment(baseDir, BASE_URL, SECRET, 'staging')

    expect(result).toEqual({ committed: 1, failed: 0 })
    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
      status: 'ingested_staging',
    })
  })

  it('returns zero counts with no network call when the source folder is empty', async () => {
    await expect(commitEnvironment(baseDir, BASE_URL, SECRET, 'staging')).resolves.toEqual({
      committed: 0,
      failed: 0,
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
