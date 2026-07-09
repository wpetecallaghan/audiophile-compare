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
  | 'dead_clip_url' // decision 12 — genuinely unreachable (404, DNS failure, timeout)
  | 'missing_clip_url' // clip-health follow-up — a comparison group's clip URL was empty
  | 'unplayable_clip_url' // clip-health follow-up — reachable, but not embeddable/playable media
  | 'unverifiable_clip_url' // clip-health follow-up — a google-drive URL; can't be network-checked, needs a human look
  | 'invalid_payload' // decision 13

// Issues a human genuinely cannot fix by editing the candidate file — the
// clip itself is unusable, not just under-described. Distinct from
// `unidentified_track` (a human can type in the real name) or
// `unresolvable_post_id`/`ambiguous_attribution`/`invalid_payload` (all
// still resolvable, or at least worth a human's attention as a candidate
// that might become usable). A candidate carrying any of these routes
// straight to `broken`, not `needs_review` — see `statusForCandidate`.
export const FATAL_CLIP_ISSUES: readonly IssueCode[] = [
  'dead_clip_url',
  'missing_clip_url',
  'unplayable_clip_url',
]

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
//
// A single named source of truth for each status value — call sites use
// `CandidateStatusValue.READY` etc. rather than repeating the string
// literal `'ready'`, so a typo can't silently create a bogus status with
// no compiler catch (this repo's repeated-string-constants convention,
// applied here — test files asserting against a real value are the
// normal, expected exception, not a repetition to fix).
export const CandidateStatusValue = {
  PENDING: 'pending',
  NEEDS_REVIEW: 'needs_review',
  READY: 'ready',
  APPROVED: 'approved',
  INGESTED_STAGING: 'ingested_staging',
  INGESTED_PRODUCTION: 'ingested_production',
  EXPIRED: 'expired',
  // A human-only destination — nothing in extraction ever writes here
  // automatically (unlike `EXPIRED`, which decision 10's sweep sets on
  // its own). A reviewer moves a candidate here after checking its
  // clip URLs by hand and finding them genuinely unusable (dead hosting,
  // taken-down share links, etc.) — distinct from decision 12's
  // `dead_clip_url` issue, which only ever catches a `direct`-provider
  // link failing its HEAD check *at extraction time*; a youtube/vimeo/
  // google-drive link trusted by URL shape, or a link that later goes
  // dead after extraction, needs a human to actually notice.
  BROKEN: 'broken',
} as const

export type CandidateStatus = (typeof CandidateStatusValue)[keyof typeof CandidateStatusValue]
export const CANDIDATE_STATUSES = Object.values(CandidateStatusValue) as CandidateStatus[]

const STATUS_FOLDERS: Record<CandidateStatus, string> = {
  [CandidateStatusValue.PENDING]: 'pending',
  [CandidateStatusValue.NEEDS_REVIEW]: 'needs_review',
  [CandidateStatusValue.READY]: 'ready',
  [CandidateStatusValue.APPROVED]: 'approved',
  [CandidateStatusValue.INGESTED_STAGING]: 'ingested/staging',
  [CandidateStatusValue.INGESTED_PRODUCTION]: 'ingested/production',
  [CandidateStatusValue.EXPIRED]: 'expired',
  [CandidateStatusValue.BROKEN]: 'broken',
}

// decision 4: re-running never touches a candidate whose file already
// exists in one of these — a human decision, once made, isn't silently
// clobbered, and an automatically-`expired` candidate (decision 10) can't
// be silently un-expired either. `broken` is protected for the same
// reason as `approved`: it's a human's definitive determination, not
// something extraction should ever second-guess on a re-run. Callers
// (candidate-index.ts) are responsible for checking this before writing
// or moving a candidate; these low-level helpers don't enforce it
// themselves.
const PROTECTED_STATUSES: readonly CandidateStatus[] = [
  CandidateStatusValue.APPROVED,
  CandidateStatusValue.INGESTED_STAGING,
  CandidateStatusValue.INGESTED_PRODUCTION,
  CandidateStatusValue.EXPIRED,
  CandidateStatusValue.BROKEN,
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

// Reads every candidate currently on disk, across all status
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
