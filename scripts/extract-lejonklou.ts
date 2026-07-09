// Standalone script — reads step 33's scraped ScrapedThread JSON and walks
// it in thread order (chronological, not grouped by author — see
// build-history-ingestion.md step 35 decision 10), building/updating a
// local candidate repository under <candidates-dir>.
// Run manually: tsx scripts/extract-lejonklou.ts <scraped-thread-json> <candidates-dir>
//
// Never calls /api/internal/ingest and needs no ingest credentials — only
// an AI Gateway credential for the generateObject call (see
// docs/vercel-setup.md). Committing (calling the ingest route) is entirely
// step 36's job.

import { readFile } from 'node:fs/promises'
import {
  buildCandidateIndex,
  sweepExpiredCandidates,
  isPostAccountedFor,
  isReplyToBrokenCandidate,
} from '../lib/ingestion/extract/candidate-index'
import { extractPost } from '../lib/ingestion/extract/extract-post'
import type { ScrapedThread } from '../lib/ingestion/scrape/parse-thread-page'

// Unlike `next dev`, a standalone `tsx` script doesn't auto-load
// `.env.local` — this is the only place AI_GATEWAY_API_KEY can come from
// for a local run. Silently continues if the file doesn't exist (e.g. the
// credential is already exported in the shell, or in CI).
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local — fall through to whatever's already in process.env
}

// Derives decision 2's `<thread>` prefix from the thread's own URL —
// `lejonklou-forum:thread-<t>` — rather than requiring a separate CLI arg
// that could drift from the JSON's own thread_url.
function deriveThreadRef(threadUrl: string): string {
  const match = threadUrl.match(/[?&]t=(\d+)/)
  if (!match) {
    throw new Error(`extract-lejonklou: could not derive a thread id from ${threadUrl}`)
  }
  return `lejonklou-forum:thread-${match[1]}`
}

async function main() {
  const [scrapedThreadPath, candidatesDir] = process.argv.slice(2)

  if (!scrapedThreadPath || !candidatesDir) {
    console.error('Usage: tsx scripts/extract-lejonklou.ts <scraped-thread-json> <candidates-dir>')
    process.exit(1)
  }

  const thread = JSON.parse(await readFile(scrapedThreadPath, 'utf-8')) as ScrapedThread
  const threadRef = deriveThreadRef(thread.thread_url)

  const index = await buildCandidateIndex(candidatesDir)

  let processed = 0
  let skippedAccountedFor = 0
  let skippedBroken = 0

  for (const post of thread.posts) {
    // decision 10: the walk visits every post regardless of skip status,
    // so the expiry clock keeps advancing even for a post whose
    // generateObject call is about to be skipped.
    await sweepExpiredCandidates(index, candidatesDir, post.posted_at)

    if (isPostAccountedFor(index, post.post_url)) {
      skippedAccountedFor++
      continue
    }

    // A reply quoting an already-`broken` candidate's post can't be a
    // useful vote or reveal for anything — skip the generateObject call
    // entirely rather than spend tokens classifying a reply to a test
    // nobody can ever actually watch.
    if (post.quoted_post_url && isReplyToBrokenCandidate(index, post.quoted_post_url)) {
      skippedBroken++
      continue
    }

    await extractPost(threadRef, post, index, candidatesDir)
    processed++
  }

  console.log(
    `Processed ${processed} post(s), skipped ${skippedAccountedFor} already-accounted-for post(s) ` +
      `and ${skippedBroken} reply/replies to a known-broken test, out of ${thread.posts.length} total.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
