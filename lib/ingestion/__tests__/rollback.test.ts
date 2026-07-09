// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm as rmDir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rollbackEnvironment } from '../rollback'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeCandidate, findExistingCandidate, type Candidate } from '../extract/candidate'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

const SUPABASE_URL = 'https://staging.supabase.co'
const SERVICE_ROLE_KEY = 'service-role-key'

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

// A minimal fake Postgrest-style chain: .select/.delete track which mode
// the chain is in (so the same chain object works for both the initial
// "find matching tests" select and a later delete call on the same or a
// different table), .in() is the terminal call actually awaited.
function makeChain(selectResult: { data?: unknown; error?: unknown }, deleteResult: { error?: unknown } = { error: null }) {
  let mode: 'select' | 'delete' = 'select'
  const chain = {
    select: vi.fn(() => {
      mode = 'select'
      return chain
    }),
    delete: vi.fn(() => {
      mode = 'delete'
      return chain
    }),
    in: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(mode === 'select' ? selectResult : deleteResult).then(resolve),
  }
  return chain
}

describe('rollbackEnvironment', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'rollback-test-'))
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await rmDir(baseDir, { recursive: true, force: true })
  })

  it('returns empty with no Supabase call at all when the source folder is empty', async () => {
    const fromMock = vi.fn()
    vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>)

    const result = await rollbackEnvironment(baseDir, SUPABASE_URL, SERVICE_ROLE_KEY, 'staging')

    expect(result).toEqual({ sourceRefs: [], testIds: [] })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('deletes votes, clip_mapping, clips, then tests, in that order, and moves staging candidates back to approved', async () => {
    await writeCandidate(baseDir, 'ingested_staging', candidate('t:post-1:pair-1'))
    await writeCandidate(baseDir, 'approved', candidate('t:post-2:pair-1')) // must be ignored

    const tableCalls: string[] = []
    const fromMock = vi.fn((table: string) => {
      tableCalls.push(table)
      if (table === 'tests') return makeChain({ data: [{ id: 'test-1' }], error: null })
      return makeChain({ data: null, error: null })
    })
    vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>)

    const result = await rollbackEnvironment(baseDir, SUPABASE_URL, SERVICE_ROLE_KEY, 'staging')

    expect(result).toEqual({ sourceRefs: ['t:post-1:pair-1'], testIds: ['test-1'] })
    // 'tests' appears twice: once for the find-by-source_ref select, once
    // for the final delete — the other three deletes happen in between.
    expect(tableCalls).toEqual(['tests', 'votes', 'clip_mapping', 'clips', 'tests'])

    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
      status: 'approved',
    })
    await expect(findExistingCandidate(baseDir, 't:post-2:pair-1')).resolves.toMatchObject({
      status: 'approved',
    })
  })

  it('production rolls back to ingested_staging, not approved', async () => {
    await writeCandidate(baseDir, 'ingested_production', candidate('t:post-1:pair-1'))
    const fromMock = vi.fn(() => makeChain({ data: [{ id: 'test-1' }], error: null }))
    vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>)

    await rollbackEnvironment(baseDir, SUPABASE_URL, SERVICE_ROLE_KEY, 'production')

    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
      status: 'ingested_staging',
    })
  })

  it('dry run resolves matching tests but deletes nothing and moves no files', async () => {
    await writeCandidate(baseDir, 'ingested_staging', candidate('t:post-1:pair-1'))
    const fromMock = vi.fn(() => makeChain({ data: [{ id: 'test-1' }], error: null }))
    vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>)

    const result = await rollbackEnvironment(baseDir, SUPABASE_URL, SERVICE_ROLE_KEY, 'staging', true)

    expect(result).toEqual({ sourceRefs: ['t:post-1:pair-1'], testIds: ['test-1'] })
    expect(fromMock).toHaveBeenCalledTimes(1) // only the find-by-source_ref select — no deletes
    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
      status: 'ingested_staging', // unmoved
    })
  })

  it('throws a descriptive error and moves nothing when a delete fails partway through', async () => {
    await writeCandidate(baseDir, 'ingested_staging', candidate('t:post-1:pair-1'))
    const fromMock = vi.fn((table: string) => {
      if (table === 'tests') return makeChain({ data: [{ id: 'test-1' }], error: null })
      if (table === 'votes') return makeChain({ data: null, error: null }, { error: { message: 'db down' } })
      return makeChain({ data: null, error: null })
    })
    vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>)

    await expect(rollbackEnvironment(baseDir, SUPABASE_URL, SERVICE_ROLE_KEY, 'staging')).rejects.toThrow(
      'db down',
    )
    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
      status: 'ingested_staging', // unmoved — the failure happened before any move
    })
  })

  it('skips deletion entirely (but reports the candidates found) when no matching tests exist on the server', async () => {
    await writeCandidate(baseDir, 'ingested_staging', candidate('t:post-1:pair-1'))
    const fromMock = vi.fn((table: string) => {
      if (table === 'tests') return makeChain({ data: [], error: null })
      throw new Error(`unexpected table: ${table}`)
    })
    vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>)

    const result = await rollbackEnvironment(baseDir, SUPABASE_URL, SERVICE_ROLE_KEY, 'staging')

    expect(result).toEqual({ sourceRefs: ['t:post-1:pair-1'], testIds: [] })
    // Still moves the candidate file back — its data was already gone
    // (or never actually committed despite the local file saying so).
    await expect(findExistingCandidate(baseDir, 't:post-1:pair-1')).resolves.toMatchObject({
      status: 'approved',
    })
  })
})
