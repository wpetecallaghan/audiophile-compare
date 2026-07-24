// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm as rmDir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitCandidate, commitEnvironment } from '../commit'
import { writeCandidate, findExistingCandidate, type Candidate } from '../extract/candidate'
import {
  HTTP_BAD_REQUEST,
  HTTP_CREATED,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

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
  const originalBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

  beforeEach(() => {
    global.fetch = vi.fn()
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalBypassSecret === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = originalBypassSecret
  })

  it('POSTs the candidate payload with the ingest secret header', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ testId: 'test-1', alreadyImported: false }, HTTP_CREATED),
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
      jsonResponse({ testId: 'test-1', alreadyImported: false }, HTTP_CREATED),
    )

    await expect(commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))).resolves.toEqual({
      testId: 'test-1',
      alreadyImported: false,
    })
  })

  it('treats a 200 alreadyImported response as success, not an error', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ testId: 'test-1', alreadyImported: true }, HTTP_OK),
    )

    await expect(commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))).resolves.toEqual({
      testId: 'test-1',
      alreadyImported: true,
    })
  })

  it('returns the real error message on a non-2xx response', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ error: 'source_ref is required' }, HTTP_BAD_REQUEST))

    await expect(commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))).resolves.toEqual({
      error: 'source_ref is required',
    })
  })

  it('falls back to an HTTP status message when a non-2xx response has no error field', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}, HTTP_INTERNAL_SERVER_ERROR))

    await expect(commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))).resolves.toEqual({
      error: 'HTTP 500',
    })
  })

  it('stringifies a non-string error field rather than returning the useless "[object Object]" — found for real against a Vercel-protected staging URL', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ error: { code: 'NOT_AUTHENTICATED', message: 'Deployment protected' } }, HTTP_UNAUTHORIZED),
    )

    const result = await commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))
    expect(result).toEqual({
      error: expect.stringContaining('NOT_AUTHENTICATED'),
    })
    expect('error' in result && result.error).not.toBe('[object Object]')
  })

  it('never sends the protection-bypass header when VERCEL_AUTOMATION_BYPASS_SECRET is unset', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ testId: 'test-1', alreadyImported: false }, HTTP_CREATED),
    )

    await commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))

    const [, init] = vi.mocked(global.fetch).mock.calls[0]
    expect((init?.headers as Record<string, string>)['x-vercel-protection-bypass']).toBeUndefined()
  })

  it('sends the Vercel protection-bypass header when VERCEL_AUTOMATION_BYPASS_SECRET is set — same header the E2E suite already uses for a protected staging URL', async () => {
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = 'bypass-secret'
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ testId: 'test-1', alreadyImported: false }, HTTP_CREATED),
    )

    await commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))

    expect(global.fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/internal/ingest`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-vercel-protection-bypass': 'bypass-secret' }),
      }),
    )
  })

  it('returns an error result instead of throwing when fetch itself rejects (network error)', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('fetch failed'))

    await expect(commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))).resolves.toEqual({
      error: 'fetch failed',
    })
  })

  it('returns an error result instead of throwing when the response body is not valid JSON', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: HTTP_UNAUTHORIZED,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON')
      },
    } as unknown as Response)

    const result = await commitCandidate(BASE_URL, SECRET, candidate('t:post-1:pair-1'))
    expect('error' in result && typeof result.error).toBe('string')
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
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ testId: 'test-1', alreadyImported: false }, HTTP_CREATED))

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
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ testId: 'test-2', alreadyImported: false }, HTTP_CREATED))

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
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ error: 'ingest failed' }, HTTP_INTERNAL_SERVER_ERROR))

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
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ error: 'ingest failed' }, HTTP_INTERNAL_SERVER_ERROR))
    await commitEnvironment(baseDir, BASE_URL, SECRET, 'staging')

    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({ testId: 'test-1', alreadyImported: false }, HTTP_CREATED))
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

  it('a network error on one candidate does not abort the rest of the batch', async () => {
    await writeCandidate(baseDir, 'approved', candidate('t:post-1:pair-1'))
    await writeCandidate(baseDir, 'approved', candidate('t:post-2:pair-1'))
    vi.mocked(global.fetch)
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(jsonResponse({ testId: 'test-2', alreadyImported: false }, HTTP_CREATED))

    const result = await commitEnvironment(baseDir, BASE_URL, SECRET, 'staging')

    expect(result).toEqual({ committed: 1, failed: 1 })
    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
      status: 'approved',
    })
    await expect(findExistingCandidate(baseDir, 't:post-2:pair-1')).resolves.toMatchObject({
      status: 'ingested_staging',
    })
  })
})
