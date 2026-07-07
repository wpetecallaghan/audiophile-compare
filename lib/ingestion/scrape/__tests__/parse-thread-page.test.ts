// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parsePostsFromPage, findNextPageUrl } from '../parse-thread-page'

const PAGE_URL = 'https://www.lejonklou.com/forum/viewtopic.php?f=2&t=3233&sid=abc123'
const THREAD_ORIGIN = 'https://www.lejonklou.com/forum'

// Fixtures mirror the real forum's actual phpBB3 markup (confirmed by
// fetching a live thread page directly) — not a generic/invented shape.
function postFixture({
  id = 'p25646',
  author = 'beck',
  datetime = '2016-03-24T12:26:30+00:00',
  authorLink = true,
  timeEl = true,
  content = 'Some post content.',
}: {
  id?: string
  author?: string
  datetime?: string
  authorLink?: boolean
  timeEl?: boolean
  content?: string
} = {}): string {
  const authorMarkup = authorLink
    ? `<strong><a href="./memberlist.php?mode=viewprofile&amp;u=731&amp;sid=abc123" class="username">${author}</a></strong>`
    : ''
  const timeMarkup = timeEl ? `<time datetime="${datetime}">2016-03-24 13:26</time>` : ''

  return `
    <div id="${id}" class="post has-profile bg2 offline">
      <div class="inner">
        <div class="postbody">
          <div id="post_content${id}">
            <h3 class="first"><a href="./viewtopic.php?p=${id.slice(1)}&amp;sid=abc123#${id}">Test post</a></h3>
            <p class="author">
              <a class="unread" href="./viewtopic.php?p=${id.slice(1)}&amp;sid=abc123#${id}" title="Post">Post</a>
              <span class="responsive-hide">by ${authorMarkup} &raquo; </span>${timeMarkup}
            </p>
            <div class="content">${content}</div>
          </div>
        </div>
      </div>
    </div>
  `
}

describe('parsePostsFromPage', () => {
  it('extracts author, timestamp, permalink, body, and links from a normal post', () => {
    const html = postFixture({
      content: 'Have a listen: <a href="https://www.youtube.com/watch?v=abc123">this clip</a><br>What do you think?',
    })

    const [post] = parsePostsFromPage(html, PAGE_URL)

    expect(post.author).toBe('beck')
    expect(post.posted_at).toBe('2016-03-24T12:26:30+00:00')
    expect(post.post_url).toBe(`${THREAD_ORIGIN}/viewtopic.php?p=25646#p25646`)
    expect(post.body_markdown).toBe(
      'Have a listen: [this clip](https://www.youtube.com/watch?v=abc123)\nWhat do you think?',
    )
    expect(post.links).toEqual([{ url: 'https://www.youtube.com/watch?v=abc123' }])
  })

  it('strips the ephemeral sid query param from the permalink', () => {
    const [post] = parsePostsFromPage(postFixture(), PAGE_URL)
    expect(post.post_url).not.toContain('sid=')
  })

  it('converts a quote block to markdown and resolves quoted_post_url to null when phpBB\'s default quote has no post link', () => {
    const html = postFixture({
      content:
        '<blockquote><div><cite>lejonklou wrote:</cite>I find the bass a bit blown up.</div></blockquote>Agreed.',
    })

    const [post] = parsePostsFromPage(html, PAGE_URL)

    expect(post.body_markdown).toBe(
      '> lejonklou wrote: I find the bass a bit blown up.\nAgreed.',
    )
    expect(post.quoted_post_url).toBeNull()
  })

  it('resolves quoted_post_url when a quote contains a manual link to a specific post', () => {
    const html = postFixture({
      content:
        '<blockquote><div><cite>lejonklou wrote:</cite>See <a href="./viewtopic.php?p=25640&amp;sid=abc123#p25640">this post</a></div></blockquote>',
    })

    const [post] = parsePostsFromPage(html, PAGE_URL)

    expect(post.quoted_post_url).toBe(`${THREAD_ORIGIN}/viewtopic.php?p=25640#p25640`)
  })

  it('excludes links inside a quote from the links array — they belong to the quoted post', () => {
    const html = postFixture({
      content:
        '<blockquote><div><cite>lejonklou wrote:</cite><a href="https://www.youtube.com/watch?v=quoted">quoted clip</a></div></blockquote>' +
        '<a href="https://www.youtube.com/watch?v=new">my clip</a>',
    })

    const [post] = parsePostsFromPage(html, PAGE_URL)

    expect(post.links).toEqual([{ url: 'https://www.youtube.com/watch?v=new' }])
  })

  it('handles a post with no username link (e.g. a deleted/anonymized user) without throwing', () => {
    expect(() => parsePostsFromPage(postFixture({ authorLink: false }), PAGE_URL)).not.toThrow()
    const [post] = parsePostsFromPage(postFixture({ authorLink: false }), PAGE_URL)
    expect(post.author).toBe('')
  })

  it('handles a post with no timestamp element without throwing', () => {
    const [post] = parsePostsFromPage(postFixture({ timeEl: false }), PAGE_URL)
    expect(post.posted_at).toBe('')
  })

  it('extracts multiple posts from one page, in document order', () => {
    const html = postFixture({ id: 'p1', author: 'first' }) + postFixture({ id: 'p2', author: 'second' })
    const posts = parsePostsFromPage(html, PAGE_URL)
    expect(posts.map((p) => p.author)).toEqual(['first', 'second'])
  })
})

describe('findNextPageUrl', () => {
  it('returns the next page URL when rel="next" is present', () => {
    const html = `
      <div class="pagination">
        <li class="arrow next">
          <a class="button" href="./viewtopic.php?f=2&amp;t=3233&amp;sid=abc123&amp;start=25" rel="next">Next</a>
        </li>
      </div>
    `
    expect(findNextPageUrl(html, PAGE_URL)).toBe(
      `${THREAD_ORIGIN}/viewtopic.php?f=2&t=3233&sid=abc123&start=25`,
    )
  })

  it('returns null on the last page, where no rel="next" link exists', () => {
    const html = `<div class="pagination"><li class="active"><span>316</span></li></div>`
    expect(findNextPageUrl(html, PAGE_URL)).toBeNull()
  })
})
