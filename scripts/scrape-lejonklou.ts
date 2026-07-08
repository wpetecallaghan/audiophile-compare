// Standalone script — fetch a Lejonklou forum thread, walk its pagination,
// and write a ScrapedThread JSON file for step 34 (extraction) to consume.
// Run manually: tsx scripts/scrape-lejonklou.ts <thread-url> <output-path> [max-pages]
//
// <thread-url> can be any page in the thread, not just the first — pass a
// URL with a `start=` offset to begin partway through (e.g. for a bounded
// sample near the end) without walking every earlier page to get there.
// [max-pages] optionally caps how many pages *this invocation* walks
// (independent of the MAX_PAGES safety cap below); omit it to walk to the
// end of the thread (or the safety cap, whichever comes first).
//
// Deterministic HTML parsing only — no LLM here (see
// build-history-ingestion.md step 33). Never calls /api/internal/ingest and
// needs no credentials; the only network access is fetching public forum
// pages and public oEmbed lookups.
//
// Resumable per-page caching (build-history-ingestion.md step 33's
// "Planned refinement"): each page's raw HTML and parsed+enriched posts are
// cached under <dirname(outputPath)>/scrape-cache/, keyed by page number. A
// re-run reads a cached page from disk instead of re-fetching (or
// re-enriching) it — delete a page's cached parsed JSON to force a re-parse
// from the still-cached HTML (no network call), or delete both its raw and
// parsed cache files to force a genuine re-fetch.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parsePostsFromPage, findNextPageUrl } from '../lib/ingestion/scrape/parse-thread-page'
import { enrichLinksWithOEmbed } from '../lib/ingestion/scrape/fetch-oembed'
import {
  readCachedRawHtml,
  writeCachedRawHtml,
  readCachedParsedPage,
  writeCachedParsedPage,
} from '../lib/ingestion/scrape/page-cache'
import type { ScrapedPost, ScrapedThread } from '../lib/ingestion/scrape/parse-thread-page'

// A generic browser user-agent — some forum hosts block requests with no
// (or an obviously non-browser) User-Agent header.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Polite delay between page requests — this is someone else's forum, not a
// service we control the load on. Only applied when a page is actually
// fetched over the network; a cache hit needs no delay at all.
const REQUEST_DELAY_MS = 500

// Safety cap — a bug in next-page detection should fail loudly well short
// of actually walking a 300+ page thread to completion.
const MAX_PAGES = 500

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) {
    throw new Error(`scrape-lejonklou: failed to fetch ${url} — HTTP ${response.status}`)
  }
  return response.text()
}

// Fetches (or reads from cache) and parses (or reads from cache) a single
// page, returning its posts, the HTML needed to find the next page URL, and
// whether a live network request was actually made (so the caller knows
// whether the polite delay applies).
async function loadPage(
  cacheDir: string,
  pageNumber: number,
  pageUrl: string,
): Promise<{ html: string; posts: ScrapedPost[]; fetchedFresh: boolean }> {
  let html = await readCachedRawHtml(cacheDir, pageNumber)
  let fetchedFresh = false

  if (html === null) {
    console.log(`Fetching page ${pageNumber}: ${pageUrl}`)
    html = await fetchPage(pageUrl)
    await writeCachedRawHtml(cacheDir, pageNumber, html)
    fetchedFresh = true
  } else {
    console.log(`Using cached page ${pageNumber}: ${pageUrl}`)
  }

  const cachedPosts = await readCachedParsedPage(cacheDir, pageNumber)
  if (cachedPosts !== null) {
    return { html, posts: cachedPosts, fetchedFresh }
  }

  const posts = parsePostsFromPage(html, pageUrl)
  for (const post of posts) {
    post.links = await enrichLinksWithOEmbed(post.links)
  }
  await writeCachedParsedPage(cacheDir, pageNumber, posts)

  return { html, posts, fetchedFresh }
}

async function scrapeThread(
  threadUrl: string,
  cacheDir: string,
  maxPages: number = MAX_PAGES,
): Promise<ScrapedPost[]> {
  const posts: ScrapedPost[] = []
  let pageUrl: string | null = threadUrl

  for (let pageNumber = 1; pageUrl && pageNumber <= maxPages; pageNumber++) {
    const { html, posts: pagePosts, fetchedFresh } = await loadPage(cacheDir, pageNumber, pageUrl)

    posts.push(...pagePosts)
    pageUrl = findNextPageUrl(html, pageUrl)

    // Only a genuine network fetch needs the polite delay — a cache hit
    // makes no request to the real forum at all.
    if (pageUrl && fetchedFresh) await sleep(REQUEST_DELAY_MS)
  }

  return posts
}

async function main() {
  const [threadUrl, outputPath, maxPagesArg] = process.argv.slice(2)

  if (!threadUrl || !outputPath) {
    console.error(
      'Usage: tsx scripts/scrape-lejonklou.ts <thread-url> <output-path> [max-pages]',
    )
    process.exit(1)
  }

  const maxPages = maxPagesArg ? Number(maxPagesArg) : MAX_PAGES
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    console.error(`Invalid max-pages: ${maxPagesArg}`)
    process.exit(1)
  }

  const cacheDir = join(dirname(outputPath), 'scrape-cache')
  const posts = await scrapeThread(threadUrl, cacheDir, maxPages)

  const thread: ScrapedThread = {
    thread_url: threadUrl,
    scraped_at: new Date().toISOString(),
    posts,
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(thread, null, 2))

  console.log(`Wrote ${posts.length} posts to ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
