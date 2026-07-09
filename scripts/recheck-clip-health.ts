// Standalone script — a retroactive sweep for candidates extracted before
// the thorough clip-health check existed (build-history-ingestion.md step
// 35, the "more thorough clip health check" follow-up to decision 12).
// Re-checking clip health is a purely deterministic, non-LLM operation, so
// this re-derives it directly from each candidate's stored clip URLs
// rather than re-running the (expensive, LLM-backed) extraction pipeline
// just to redo a network check.
//
// Only ever reads/writes `pending/`, `needs_review/`, and `ready/` — the
// three non-protected statuses a candidate could still legitimately move
// out of. Never touches `approved/`, `ingested/*`, `expired/`, or
// `broken/` — those are a human's or decision 10's own definitive
// determination, same protection principle as everywhere else in this
// pipeline.
// Run manually: tsx scripts/recheck-clip-health.ts <candidates-dir>

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { checkClipHealth, type ClipHealthStatus } from '../lib/ingestion/extract/clip-health'
import {
  writeCandidate,
  deleteCandidate,
  FATAL_CLIP_ISSUES,
  CandidateStatusValue,
  type Candidate,
  type CandidateStatus,
  type IssueCode,
} from '../lib/ingestion/extract/candidate'
import { statusForCandidate } from '../lib/ingestion/extract/extract-post'

const RECHECKABLE_FOLDERS: CandidateStatus[] = [
  CandidateStatusValue.PENDING,
  CandidateStatusValue.NEEDS_REVIEW,
  CandidateStatusValue.READY,
]

function issueForClipHealth(status: ClipHealthStatus): IssueCode | null {
  if (status === 'missing') return 'missing_clip_url'
  if (status === 'dead') return 'dead_clip_url'
  if (status === 'unplayable') return 'unplayable_clip_url'
  if (status === 'unverifiable') return 'unverifiable_clip_url'
  return null
}

// Every issue code this script can itself derive — stripped and
// re-derived fresh on every run (see recheckOne). `unverifiable_clip_url`
// is non-fatal (a google-drive URL can't be network-checked at all, see
// clip-health.ts) but still belongs here so a stale copy from a previous
// run doesn't linger once re-derived.
const CLIP_HEALTH_ISSUES: readonly IssueCode[] = [...FATAL_CLIP_ISSUES, 'unverifiable_clip_url']

// Mutates candidate.issues in place: strips any clip-health issue left
// over from a previous (weaker) check, then re-derives it fresh — never
// accumulates stale duplicates across repeated runs, and correctly clears
// an issue for a clip that's since recovered.
async function recheckOne(candidate: Candidate): Promise<void> {
  candidate.issues = candidate.issues.filter((issue) => !CLIP_HEALTH_ISSUES.includes(issue))

  const urls = [candidate.payload.clip_a_url ?? '', candidate.payload.clip_b_url ?? '']
  for (const url of urls) {
    const status = url.trim() === '' ? 'missing' : await checkClipHealth(url)
    const issue = issueForClipHealth(status)
    if (issue && !candidate.issues.includes(issue)) candidate.issues.push(issue)
  }
}

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
    const sourceRef = candidate.payload.source_ref
    if (!sourceRef) continue

    const issuesBefore = [...candidate.issues].sort()
    await recheckOne(candidate)
    const newStatus = statusForCandidate(candidate)
    const issuesChanged = JSON.stringify(issuesBefore) !== JSON.stringify([...candidate.issues].sort())

    if (newStatus === status && !issuesChanged) continue // nothing changed, don't rewrite for no reason

    await writeCandidate(baseDir, newStatus, candidate)
    if (newStatus !== status) {
      await deleteCandidate(baseDir, status, sourceRef)
    }
    console.log(`${sourceRef}: clip health rechecked (${status} -> ${newStatus})`)
    changed++
  }
  return changed
}

async function main() {
  const [candidatesDir] = process.argv.slice(2)
  if (!candidatesDir) {
    console.error('Usage: tsx scripts/recheck-clip-health.ts <candidates-dir>')
    process.exit(1)
  }

  let total = 0
  for (const status of RECHECKABLE_FOLDERS) {
    total += await processFolder(candidatesDir, status)
  }
  console.log(`Rechecked clip health; moved/updated ${total} candidate(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
