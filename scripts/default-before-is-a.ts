// Standalone script — a human-reviewer override for candidates whose
// reveal never matched (build-history-ingestion.md step 35). decision 4
// protects `expired/` from *automated* changes, but a human reviewer
// determining an auto-expiry was wrong (the post just didn't fit the
// clean test-post -> votes -> reveal-post pattern extraction expects, not
// that the test was genuinely abandoned) can override it directly — the
// same manual-edit workflow decision 7 already established for track
// identification.
//
// Defaults `before_is_a: true` for every candidate in needs_review/ and
// expired/ that doesn't already have it set, recomputes status via the
// same `statusForCandidate` extraction itself uses, and moves each file
// accordingly. Never touches a candidate that already has a real
// before_is_a value (from a reveal that did match).
// Run manually: tsx scripts/default-before-is-a.ts <candidates-dir>

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  writeCandidate,
  deleteCandidate,
  CandidateStatusValue,
  type Candidate,
  type CandidateStatus,
} from '../lib/ingestion/extract/candidate'
import { statusForCandidate } from '../lib/ingestion/extract/extract-post'

const SOURCE_FOLDERS: CandidateStatus[] = [CandidateStatusValue.NEEDS_REVIEW, CandidateStatusValue.EXPIRED]

async function processFolder(baseDir: string, status: CandidateStatus): Promise<number> {
  const dir = join(baseDir, status)
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return 0
  }

  let changed = 0
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const path = join(dir, entry)
    const candidate = JSON.parse(await readFile(path, 'utf-8')) as Candidate
    if (typeof candidate.payload.before_is_a === 'boolean') continue // a real reveal already matched

    const sourceRef = candidate.payload.source_ref
    if (!sourceRef) continue

    candidate.payload.before_is_a = true
    const newStatus = statusForCandidate(candidate)

    await writeCandidate(baseDir, newStatus, candidate)
    if (newStatus !== status) {
      await deleteCandidate(baseDir, status, sourceRef)
    }
    console.log(`${sourceRef}: before_is_a defaulted to true (${status} -> ${newStatus})`)
    changed++
  }
  return changed
}

async function main() {
  const [candidatesDir] = process.argv.slice(2)
  if (!candidatesDir) {
    console.error('Usage: tsx scripts/default-before-is-a.ts <candidates-dir>')
    process.exit(1)
  }

  let total = 0
  for (const status of SOURCE_FOLDERS) {
    total += await processFolder(candidatesDir, status)
  }
  console.log(`Defaulted before_is_a for ${total} candidate(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
