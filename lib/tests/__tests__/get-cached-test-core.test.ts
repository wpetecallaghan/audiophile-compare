import { describe, it, expect, vi } from 'vitest'
import { fetchTestCore, fetchRevealedMapping } from '../get-cached-test-core'
import { createClient } from '@/lib/supabase/client'

// @vitest-environment node

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

// A minimal fake Postgrest-style chain: .select/.eq return itself (so
// calls can be chained in any order the real code uses), .single()
// resolves to whatever `result` this chain was built with — same
// precedent as lib/ingestion/__tests__/create-placeholder-author.test.ts's
// makeChain, adapted for .single() rather than .maybeSingle().
function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: {
    select: (...args: unknown[]) => typeof chain
    eq: (...args: unknown[]) => typeof chain
    single: () => Promise<typeof result>
  } = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
  }
  return chain
}

describe('fetchTestCore', () => {
  it('returns the row on success', async () => {
    const row = { id: 'test-1', title: 'A vs B', status: 'open' }
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn(() => makeChain({ data: row })),
    } as never)

    const result = await fetchTestCore('test-1')
    expect(result).toEqual(row)
  })

  it('returns null when the query errors', async () => {
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn(() => makeChain({ data: null, error: { message: 'not found' } })),
    } as never)

    const result = await fetchTestCore('missing-id')
    expect(result).toBeNull()
  })

  it('returns null when there is no error but no data either', async () => {
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn(() => makeChain({ data: null })),
    } as never)

    const result = await fetchTestCore('missing-id')
    expect(result).toBeNull()
  })
})

describe('fetchRevealedMapping', () => {
  it('returns the mapping row when present (revealed test)', async () => {
    const mapping = { before_clip_id: 'clip-a', after_clip_id: 'clip-b' }
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn(() => makeChain({ data: mapping })),
    } as never)

    const result = await fetchRevealedMapping('test-1')
    expect(result).toEqual(mapping)
  })

  it('returns null when RLS blocks the read (test not yet revealed)', async () => {
    // clip_mapping's RLS ("revealed OR creator_id = auth.uid()") means the
    // anon-key client used here gets no row at all for a still-open test —
    // PostgREST resolves that as data: null, not an error.
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn(() => makeChain({ data: null })),
    } as never)

    const result = await fetchRevealedMapping('test-1')
    expect(result).toBeNull()
  })
})
