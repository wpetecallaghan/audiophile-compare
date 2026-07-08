import { describe, it, expect } from 'vitest'
import { buildSourceRef } from '../source-ref'
import type { ScrapedPost } from '../../scrape/parse-thread-page'

const THREAD_REF = 'lejonklou-forum:thread-3233'

function post(overrides: Partial<ScrapedPost> = {}): ScrapedPost {
  return {
    post_url: 'https://www.lejonklou.com/forum/viewtopic.php?p=72033#p72033',
    author: 'Charlie1',
    posted_at: '2024-01-01T00:00:00Z',
    body_markdown: 'A vs B, which do you prefer?',
    quoted_post_url: null,
    links: [],
    ...overrides,
  }
}

describe('buildSourceRef', () => {
  it('keys a normal post off its real phpBB post ID, via ?p=', () => {
    const result = buildSourceRef(THREAD_REF, post(), 1)

    expect(result).toEqual({
      sourceRef: `${THREAD_REF}:post-72033:pair-1`,
      unresolvable: false,
    })
  })

  it('keys a normal post off its real phpBB post ID, via &p=', () => {
    const result = buildSourceRef(
      THREAD_REF,
      post({ post_url: 'https://www.lejonklou.com/forum/viewtopic.php?f=2&t=3233&p=72033#p72033' }),
      1,
    )

    expect(result.sourceRef).toBe(`${THREAD_REF}:post-72033:pair-1`)
  })

  it('never derives the post ID from array position — only ever from post_url', () => {
    // Same post_url, different pairIndex: only pair-<i> should differ.
    const first = buildSourceRef(THREAD_REF, post(), 1)
    const second = buildSourceRef(THREAD_REF, post(), 2)

    expect(first.sourceRef).toBe(`${THREAD_REF}:post-72033:pair-1`)
    expect(second.sourceRef).toBe(`${THREAD_REF}:post-72033:pair-2`)
  })

  it('uses pair-1 even when there is only one pair, for consistency', () => {
    const result = buildSourceRef(THREAD_REF, post(), 1)
    expect(result.sourceRef).toContain(':pair-1')
  })

  it('falls back to a content-hash key, flagged unresolvable, when post_url is empty', () => {
    const result = buildSourceRef(THREAD_REF, post({ post_url: '' }), 1)

    expect(result.unresolvable).toBe(true)
    expect(result.sourceRef).toMatch(
      new RegExp(`^${THREAD_REF}:unresolvable-[0-9a-f]{12}:pair-1$`),
    )
  })

  it('falls back to a content-hash key when post_url has no parseable ID', () => {
    const result = buildSourceRef(THREAD_REF, post({ post_url: 'https://example.com/no-id-here' }), 1)

    expect(result.unresolvable).toBe(true)
    expect(result.sourceRef).toMatch(/:unresolvable-[0-9a-f]{12}:pair-1$/)
  })

  it('gives two different unresolvable posts two different hashes — never colliding', () => {
    const a = buildSourceRef(THREAD_REF, post({ post_url: '', author: 'Alice' }), 1)
    const b = buildSourceRef(THREAD_REF, post({ post_url: '', author: 'Bob' }), 1)

    expect(a.sourceRef).not.toBe(b.sourceRef)
  })

  it('gives the same unresolvable post the same hash every time, regardless of array position', () => {
    // Same content, called independently — simulates the same post being
    // re-encountered in a different array position across runs.
    const first = buildSourceRef(THREAD_REF, post({ post_url: '' }), 1)
    const second = buildSourceRef(THREAD_REF, post({ post_url: '' }), 1)

    expect(first.sourceRef).toBe(second.sourceRef)
  })
})
