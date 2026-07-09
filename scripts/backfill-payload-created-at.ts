// Standalone script — one-off backfill for candidates extracted before
// extract-post.ts started populating payload.created_at (build-history-
// ingestion.md step 36 finding 8's created_at fix). A candidate's own
// Candidate.created_at (the test-defining post's real date) has always
// been tracked; it just never made it into payload.created_at — the
// field the ingest route actually sends to ingest_test — until that fix
// landed, and that fix only affects candidates extracted *after* it, not
// the ones already sitting on disk.
//
// Sets payload.created_at = created_at for any candidate missing it,
// across every status folder, and writes it back in place — never
// changes status (this has no bearing on statusForCandidate), so it's
// safe to run even against approved/ingested/broken/expired without
// disturbing decision 4's protected-status handling.
// Run manually: tsx scripts/backfill-payload-created-at.ts <candidates-dir>

import { readAllCandidates, writeCandidate } from '../lib/ingestion/extract/candidate'

async function main() {
  const [candidatesDir] = process.argv.slice(2)
  if (!candidatesDir) {
    console.error('Usage: tsx scripts/backfill-payload-created-at.ts <candidates-dir>')
    process.exit(1)
  }

  let backfilled = 0
  let skipped = 0

  for (const { status, candidate } of await readAllCandidates(candidatesDir)) {
    if (candidate.payload.created_at) {
      skipped++
      continue
    }
    if (!candidate.created_at) continue // nothing to backfill from either

    candidate.payload.created_at = candidate.created_at
    await writeCandidate(candidatesDir, status, candidate)
    console.log(`${candidate.payload.source_ref}: payload.created_at backfilled to ${candidate.created_at}`)
    backfilled++
  }

  console.log(`Backfilled ${backfilled} candidate(s), ${skipped} already had payload.created_at.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
