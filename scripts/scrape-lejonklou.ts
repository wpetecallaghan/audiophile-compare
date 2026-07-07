// Standalone script — fetch a Lejonklou forum thread, walk its pagination,
// and write a ScrapedThread JSON file for step 34 (extraction) to consume.
// Run manually: tsx scripts/scrape-lejonklou.ts <thread-url> <output-path>
//
// Deterministic HTML parsing only — no LLM here (see
// build-history-ingestion.md step 33). Never calls /api/internal/ingest and
// needs no credentials; the only network access is fetching public forum
// pages and public oEmbed lookups.

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parsePostsFromPage, findNextPageUrl } from '../lib/ingestion/scrape/parse-thread-page'
import { enrichLinksWithOEmbed } from '../lib/ingestion/scrape/fetch-oembed'
import type { ScrapedPost, ScrapedThread } from '../lib/ingestion/scrape/parse-thread-page'

// A generic browser user-agent — some forum hosts block requests with no
// (or an obviously non-browser) User-Agent header.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// Polite delay between page requests — this is someone else's forum, not a
// service we control the load on.
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

async function scrapeThread(threadUrl: string): Promise<ScrapedPost[]> {
  const posts: ScrapedPost[] = []
  let pageUrl: string | null = threadUrl

  for (let pageCount = 0; pageUrl && pageCount < MAX_PAGES; pageCount++) {
    console.log(`Fetching page ${pageCount + 1}: ${pageUrl}`)
    const html: string = await fetchPage(pageUrl)

    posts.push(...parsePostsFromPage(html, pageUrl))
    pageUrl = findNextPageUrl(html, pageUrl)

    if (pageUrl) await sleep(REQUEST_DELAY_MS)
  }

  return posts
}

async function main() {
  const [threadUrl, outputPath] = process.argv.slice(2)

  if (!threadUrl || !outputPath) {
    console.error('Usage: tsx scripts/scrape-lejonklou.ts <thread-url> <output-path>')
    process.exit(1)
  }

  const posts = await scrapeThread(threadUrl)

  console.log(`Fetching oEmbed metadata for links found across ${posts.length} posts...`)
  for (const post of posts) {
    post.links = await enrichLinksWithOEmbed(post.links)
  }

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
