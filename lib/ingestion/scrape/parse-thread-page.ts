import { JSDOM } from 'jsdom'

// Shape confirmed against the real forum's markup (phpBB3): a post is
// `div.post[id="p12345"]`; the byline (`p.author`) holds both the author's
// username link and a `<time datetime="...">` with a machine-readable ISO
// timestamp; the body is `div.content`, with quoted replies rendered as
// `<blockquote><div><cite>user wrote:</cite>text</div></blockquote>` — note
// this default quote rendering carries no link back to the quoted post, so
// quoted_post_url resolves to null unless someone manually links one.

export type ScrapedLink = {
  url: string
  oembed_title?: string
  oembed_author?: string
}

export type ScrapedPost = {
  post_url: string
  author: string
  posted_at: string
  body_markdown: string
  quoted_post_url: string | null
  links: ScrapedLink[]
}

export type ScrapedThread = {
  thread_url: string
  scraped_at: string
  posts: ScrapedPost[]
}

// Strips the ephemeral phpBB session id (`sid`) from a URL so stored
// permalinks stay stable across scrapes/sessions.
function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('sid')
    return parsed.toString()
  } catch {
    return url
  }
}

// Recursively converts a post body's DOM into markdown. Deliberately not a
// general-purpose HTML→markdown library — just what this forum's post
// bodies actually use: text, <br>, <a>, and <blockquote><cite>...</cite>...
// Anything else (b/i/strong/em/span/div wrappers) is unwrapped, keeping its
// text content, rather than dropped or erroring.
function nodeToMarkdown(node: Node): string {
  if (node.nodeType === node.TEXT_NODE) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== node.ELEMENT_NODE) {
    return ''
  }

  const el = node as Element
  const tag = el.tagName.toLowerCase()

  if (tag === 'br') {
    return '\n'
  }

  if (tag === 'a') {
    const href = (el as HTMLAnchorElement).href || el.getAttribute('href') || ''
    const text = el.textContent?.trim() ?? href
    return `[${text}](${href})`
  }

  if (tag === 'blockquote') {
    const inner = Array.from(el.childNodes).map(nodeToMarkdown).join('')
    const quoted = inner
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    return `${quoted}\n`
  }

  if (tag === 'cite') {
    return `${el.textContent ?? ''} `
  }

  // Generic inline/block wrapper — recurse into children, keep the text.
  return Array.from(el.childNodes).map(nodeToMarkdown).join('')
}

function bodyToMarkdown(contentEl: Element): string {
  return Array.from(contentEl.childNodes)
    .map(nodeToMarkdown)
    .join('')
    .trim()
}

// Links this post itself contributes — excludes anything inside a
// blockquote, since a link inside a quoted reply belongs to the post being
// quoted, not this one.
function extractLinks(contentEl: Element): ScrapedLink[] {
  const anchors = Array.from(contentEl.querySelectorAll('a[href]'))
  return anchors
    .filter((a) => !a.closest('blockquote'))
    .map((a) => ({ url: (a as HTMLAnchorElement).href }))
}

// phpBB's default "Reply with quote" doesn't link back to the quoted post
// (just `<cite>user wrote:</cite>`) — but if a quote happens to contain a
// manual link to a specific post (`viewtopic.php?...#p12345`), resolve it.
function extractQuotedPostUrl(contentEl: Element): string | null {
  const quoteLinks = Array.from(contentEl.querySelectorAll('blockquote a[href]'))
  const postLink = quoteLinks.find((a) => /[?&]p=\d+/.test((a as HTMLAnchorElement).href))
  return postLink ? canonicalizeUrl((postLink as HTMLAnchorElement).href) : null
}

export function parsePostsFromPage(html: string, pageUrl: string): ScrapedPost[] {
  const dom = new JSDOM(html, { url: pageUrl })
  const document = dom.window.document

  return Array.from(document.querySelectorAll('div.post[id]')).map((postEl) => {
    // Not just `a.username` — special roles (admins, custom profile colors)
    // render as `a.username-coloured` instead. Confirmed against a real
    // page: every post from this forum's own admin/owner silently lost its
    // author with a class-based selector. `strong > a` is the structural
    // wrapper both variants share.
    const authorLink = postEl.querySelector('p.author strong a')
    const time = postEl.querySelector('p.author time[datetime]')
    const permalink = postEl.querySelector('p.author a[href], h3.first a[href]')
    const contentEl = postEl.querySelector('div.content')

    return {
      post_url: permalink ? canonicalizeUrl((permalink as HTMLAnchorElement).href) : '',
      author: authorLink?.textContent?.trim() ?? '',
      posted_at: time?.getAttribute('datetime') ?? '',
      body_markdown: contentEl ? bodyToMarkdown(contentEl) : '',
      quoted_post_url: contentEl ? extractQuotedPostUrl(contentEl) : null,
      links: contentEl ? extractLinks(contentEl) : [],
    }
  })
}

// phpBB marks the "next page" link with rel="next" — a semantic attribute
// rather than matching on visible text (which is themeable/localizable).
export function findNextPageUrl(html: string, currentUrl: string): string | null {
  const dom = new JSDOM(html, { url: currentUrl })
  const next = dom.window.document.querySelector('a[rel="next"]')
  return next ? (next as HTMLAnchorElement).href : null
}
