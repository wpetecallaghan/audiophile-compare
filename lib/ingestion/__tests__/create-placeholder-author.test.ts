import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createPlaceholderAuthor,
  slugify,
  USERS_TABLE,
  IMPORT_AUTHORS_TABLE,
} from '../create-placeholder-author'
import { createAdminClient } from '@/lib/supabase/admin'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

const FORUM_SOURCE = 'lejonklou-forum'
const EXTERNAL_USERNAME = 'BassHead99'
const COLLIDING_EMAIL = 'bass-head@import.audiophile-compare.uk'

// A minimal fake Postgrest-style chain: .select/.eq/.update return itself
// (so calls can be chained in any order the real code uses), and it's
// directly awaitable (mirrors the real query builder's thenable behavior),
// resolving to whatever `result` this chain was built with.
function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: {
    select: (...args: unknown[]) => typeof chain
    eq: (...args: unknown[]) => typeof chain
    update: (...args: unknown[]) => typeof chain
    insert: (...args: unknown[]) => typeof chain
    maybeSingle: () => Promise<typeof result>
    then: (resolve: (value: typeof result) => unknown) => Promise<unknown>
  } = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve) => Promise.resolve(result).then(resolve),
  }
  return chain
}

describe('slugify', () => {
  it('lowercases and strips to [a-z0-9-]', () => {
    expect(slugify('BassHead_99!')).toBe('basshead-99')
  })

  it('collapses repeated separators', () => {
    expect(slugify('Bass___Head')).toBe('bass-head')
  })

  it('trims leading/trailing dashes produced by stripping', () => {
    expect(slugify('!!!BassHead!!!')).toBe('basshead')
  })

  it('truncates to 40 characters', () => {
    const long = 'a'.repeat(60)
    expect(slugify(long)).toHaveLength(40)
  })
})

describe('createPlaceholderAuthor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the existing user_id when (source, externalUsername) already has a mapping', async () => {
    const createUser = vi.fn()
    const fromMock = vi.fn(() => makeChain({ data: { user_id: 'existing-user-id' } }))

    vi.mocked(createAdminClient).mockReturnValue({
      from: fromMock,
      auth: { admin: { createUser } },
    } as unknown as ReturnType<typeof createAdminClient>)

    const userId = await createPlaceholderAuthor({
      source: FORUM_SOURCE,
      externalUsername: EXTERNAL_USERNAME,
    })

    expect(userId).toBe('existing-user-id')
    expect(createUser).not.toHaveBeenCalled()
  })

  it('creates a new placeholder author when no mapping exists', async () => {
    const createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'new-user-id' } }, error: null })
    const fromMock = vi.fn((table: string) => {
      if (table === IMPORT_AUTHORS_TABLE) return makeChain({ data: null, error: null })
      if (table === USERS_TABLE) {
        // Both the email-collision check (select) and the is_placeholder
        // update (update().eq()) resolve fine with no match
        return makeChain({ data: null, error: null })
      }
      throw new Error(`unexpected table: ${table}`)
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: fromMock,
      auth: { admin: { createUser } },
    } as unknown as ReturnType<typeof createAdminClient>)

    const userId = await createPlaceholderAuthor({
      source: FORUM_SOURCE,
      externalUsername: EXTERNAL_USERNAME,
      displayName: 'Bass Head',
    })

    expect(userId).toBe('new-user-id')
    expect(createUser).toHaveBeenCalledWith({
      email: 'basshead99@import.audiophile-compare.uk',
      email_confirm: true,
      user_metadata: { full_name: 'Bass Head' },
    })
  })

  it('gives two different raw usernames that slugify identically two distinct placeholders', async () => {
    const createUser = vi.fn()
      .mockResolvedValueOnce({ data: { user: { id: 'user-a' } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'user-b' } }, error: null })

    // Track which emails are "taken" as createUser succeeds, so the second
    // author's email-collision check sees the first author's email as used.
    const takenEmails = new Set<string>()

    const fromMock = vi.fn((table: string) => {
      if (table === IMPORT_AUTHORS_TABLE) {
        // Neither author has an existing mapping yet
        return makeChain({ data: null, error: null })
      }
      // USERS_TABLE — email collision check: report "taken" if already recorded
      if (table !== USERS_TABLE) throw new Error(`unexpected table: ${table}`)
      const chain = makeChain({ data: null, error: null })
      const originalEq = chain.eq
      chain.eq = vi.fn((...args: unknown[]) => {
        const [column, value] = args as [string, string]
        if (column === 'email' && takenEmails.has(value)) {
          chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: 'someone' }, error: null }))
        }
        return originalEq(column, value)
      })
      return chain
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: fromMock,
      auth: { admin: { createUser } },
    } as unknown as ReturnType<typeof createAdminClient>)

    const firstUserId = await createPlaceholderAuthor({
      source: FORUM_SOURCE,
      externalUsername: 'Bass-Head',
    })
    takenEmails.add(COLLIDING_EMAIL)

    const secondUserId = await createPlaceholderAuthor({
      source: FORUM_SOURCE,
      externalUsername: 'bass-head', // slugifies identically to 'Bass-Head'
    })

    expect(firstUserId).toBe('user-a')
    expect(secondUserId).toBe('user-b')
    expect(firstUserId).not.toBe(secondUserId)
    expect(createUser).toHaveBeenNthCalledWith(1, expect.objectContaining({
      email: COLLIDING_EMAIL,
    }))
    expect(createUser).toHaveBeenNthCalledWith(2, expect.objectContaining({
      email: 'bass-head-2@import.audiophile-compare.uk',
    }))
  })

  it('throws when auth user creation fails', async () => {
    const createUser = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const fromMock = vi.fn(() => makeChain({ data: null, error: null }))

    vi.mocked(createAdminClient).mockReturnValue({
      from: fromMock,
      auth: { admin: { createUser } },
    } as unknown as ReturnType<typeof createAdminClient>)

    await expect(
      createPlaceholderAuthor({ source: FORUM_SOURCE, externalUsername: EXTERNAL_USERNAME }),
    ).rejects.toThrow('boom')
  })
})
