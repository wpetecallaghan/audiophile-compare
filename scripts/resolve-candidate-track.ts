// Standalone script — the human side of decision 7's track-identification
// fallback (build-history-ingestion.md step 35): a candidate flagged
// `unidentified_track` is meant to be resolved by a human editing the file
// directly. This just automates the mechanical part of that — set the
// real track, clear the issue, recompute status via the same
// `statusForCandidate` extraction itself uses, and move the file if its
// status changed (e.g. needs_review -> ready, once nothing else is
// outstanding).
// Run manually: tsx scripts/resolve-candidate-track.ts <candidate-json-path> <artist> <title>

import { readFile } from 'node:fs/promises'
import { dirname, basename } from 'node:path'
import {
  writeCandidate,
  deleteCandidate,
  type Candidate,
  type CandidateStatus,
} from '../lib/ingestion/extract/candidate'
import { statusForCandidate } from '../lib/ingestion/extract/extract-post'

async function main() {
  const [candidatePath, artist, title] = process.argv.slice(2)

  if (!candidatePath || !artist || !title) {
    console.error('Usage: tsx scripts/resolve-candidate-track.ts <candidate-json-path> <artist> <title>')
    process.exit(1)
  }

  const candidate = JSON.parse(await readFile(candidatePath, 'utf-8')) as Candidate
  const sourceRef = candidate.payload.source_ref
  if (!sourceRef) {
    console.error(`${candidatePath}: payload.source_ref is missing — not a valid candidate file`)
    process.exit(1)
  }

  candidate.payload.track = { artist, title }
  candidate.issues = candidate.issues.filter((issue) => issue !== 'unidentified_track')

  // Derived from the file's own location — <candidatesDir>/<status>/<file>.json.
  const baseDir = dirname(dirname(candidatePath))
  const currentStatus = basename(dirname(candidatePath)) as CandidateStatus
  const newStatus = statusForCandidate(candidate)

  await writeCandidate(baseDir, newStatus, candidate)
  if (newStatus !== currentStatus) {
    await deleteCandidate(baseDir, currentStatus, sourceRef)
  }

  console.log(`${sourceRef}: track set to "${artist} – ${title}" (${currentStatus} -> ${newStatus})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
