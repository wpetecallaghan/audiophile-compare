import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { IngestPayload } from '../ingest-test-payload'

// A candidate's own typed problem codes (build-history-ingestion.md step 35
// decision 1) — never free text, so step 37 tooling can filter/group on
// them reliably. Anything that would otherwise be a free-text message (like
// validateIngestPayload's `error` string) goes in `notes` instead.
export type IssueCode =
  | 'unidentified_track' // decision 7
  | 'unresolvable_post_id' // decision 2
  | 'missing_timestamp' // decision 10
  | 'ambiguous_attribution' // decision 10
  | 'dead_clip_url' // decision 12
  | 'invalid_payload' // decision 13

export type Candidate = {
  // The test-defining post's own posted_at — decision 10's expiry clock
  // anchor. '' when the post itself had no resolvable timestamp
  // (decision 10's missing_timestamp path); such a candidate never enters
  // expiry tracking at all (see candidate-index.ts).
  created_at: string
  payload: Partial<IngestPayload>
  issues: IssueCode[]
  notes?: string[]
  // Every post_url that has been folded into this candidate: its source
  // post, every vote/reply post accepted for it, and its reveal post if
  // closed (decision 16). Never includes an empty post_url — see
  // candidate-index.ts for why.
  contributing_posts: string[]
  // The forum's own label(s) for this candidate's clip pair, as used by
  // its creator (decision 5) — e.g. ['A', 'B'] or ['1153', '1155']. Used
  // for decision 10's bare-label fallback attribution; distinct from
  // `clips.label` (assigned at ingest time) and before/after
  // (`payload.before_is_a`).
  forum_labels: string[]
}

// Status is folder location, not a field (decision 3) — no `status` sits
// inside the JSON at all. `ingested_staging`/`ingested_production` map to
// the nested `ingested/staging`/`ingested/production` folders; every other
// status is a flat top-level folder under the given base directory.
export const CANDIDATE_STATUSES = [
  'pending',
  'needs_review',
  'ready',
  'approved',
  'ingested_staging',
  'ingested_production',
  'expired',
] as const

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number]

const STATUS_FOLDERS: Record<CandidateStatus, string> = {
  pending: 'pending',
  needs_review: 'needs_review',
  ready: 'ready',
  approved: 'approved',
  ingested_staging: 'ingested/staging',
  ingested_production: 'ingested/production',
  expired: 'expired',
}

// decision 4: re-running never touches a candidate whose file already
// exists in one of these — a human decision, once made, isn't silently
// clobbered, and an automatically-`expired` candidate (decision 10) can't
// be silently un-expired either. Callers (candidate-index.ts) are
// responsible for checking this before writing or moving a candidate;
// these low-level helpers don't enforce it themselves.
const PROTECTED_STATUSES: readonly CandidateStatus[] = [
  'approved',
  'ingested_staging',
  'ingested_production',
  'expired',
]

export function isProtectedStatus(status: CandidateStatus): boolean {
  return PROTECTED_STATUSES.includes(status)
}

// decision 10/16: a candidate's open/closed state is read directly from its
// own content — never replayed post-by-post. `before_is_a` populated means
// a reveal has already been folded into this candidate.
export function isRevealed(candidate: Candidate): boolean {
  return typeof candidate.payload.before_is_a === 'boolean'
}

function fileNameFor(sourceRef: string): string {
  return `${sourceRef.replace(/:/g, '__')}.json`
}

function filePathFor(baseDir: string, status: CandidateStatus, sourceRef: string): string {
  return join(baseDir, STATUS_FOLDERS[status], fileNameFor(sourceRef))
}

async function readCandidateFile(path: string): Promise<Candidate | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as Candidate
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

// Looks for a source_ref's file across every status folder — used to check
// decision 4's "never touch a candidate already resolved" rule before
// writing, and to resolve a specific candidate by source_ref.
export async function findExistingCandidate(
  baseDir: string,
  sourceRef: string,
): Promise<{ status: CandidateStatus; candidate: Candidate } | null> {
  for (const status of CANDIDATE_STATUSES) {
    const candidate = await readCandidateFile(filePathFor(baseDir, status, sourceRef))
    if (candidate) return { status, candidate }
  }
  return null
}

export async function writeCandidate(
  baseDir: string,
  status: CandidateStatus,
  candidate: Candidate,
): Promise<void> {
  const sourceRef = candidate.payload.source_ref
  if (!sourceRef) {
    throw new Error('writeCandidate: candidate.payload.source_ref is required')
  }

  const path = filePathFor(baseDir, status, sourceRef)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(candidate, null, 2))
}

// Deletes a candidate's file at a specific status, if present. A no-op if
// it doesn't exist there. Used when a candidate's *content* changes at the
// same time its status does (candidate-index.ts's `saveCandidate`) — moving
// stale, unchanged content the way `moveCandidate` does wouldn't reflect
// the update.
export async function deleteCandidate(
  baseDir: string,
  status: CandidateStatus,
  sourceRef: string,
): Promise<void> {
  try {
    await rm(filePathFor(baseDir, status, sourceRef))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

// Moves a candidate's file from one status folder to another (e.g.
// pending -> ready) as its completeness changes across runs. A no-op if
// nothing exists at `from`. Never checks decision 4's protected-status
// rule itself — the caller must not move a candidate *out of* a protected
// status.
export async function moveCandidate(
  baseDir: string,
  sourceRef: string,
  from: CandidateStatus,
  to: CandidateStatus,
): Promise<void> {
  if (from === to) return

  const candidate = await readCandidateFile(filePathFor(baseDir, from, sourceRef))
  if (!candidate) return

  await writeCandidate(baseDir, to, candidate)
  await rm(filePathFor(baseDir, from, sourceRef))
}

// Reads every candidate currently on disk, across all seven status
// folders — the basis for decision 10's shared index (open-candidate
// matching, drawn only from pending/needs_review/ready) and decision 16's
// contributing_posts skip-set (which needs every folder's provenance, so a
// post that already contributed to an approved/ingested/expired candidate
// isn't reprocessed as new).
export async function readAllCandidates(
  baseDir: string,
): Promise<Array<{ status: CandidateStatus; candidate: Candidate }>> {
  const results: Array<{ status: CandidateStatus; candidate: Candidate }> = []

  for (const status of CANDIDATE_STATUSES) {
    const dir = join(baseDir, STATUS_FOLDERS[status])
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw err
    }

    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      const candidate = await readCandidateFile(join(dir, entry))
      if (candidate) results.push({ status, candidate })
    }
  }

  return results
}
