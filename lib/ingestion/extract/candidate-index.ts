import {
  readAllCandidates,
  writeCandidate,
  deleteCandidate,
  isProtectedStatus,
  isRevealed,
  type Candidate,
  type CandidateStatus,
} from './candidate'

// The shared, cross-author index (build-history-ingestion.md step 35
// decision 10) that makes reply-to-test attribution possible without
// grouping posts by author. Built once from disk at the start of a walk,
// then kept current in memory as posts are processed — see `saveCandidate`.
export type CandidateIndex = {
  // decision 16: every post_url already accounted for, across all seven
  // status folders, never just the open ones — the basis for skipping a
  // post's `generateObject` call entirely on a resumed run. Never includes
  // an empty post_url (an `unresolvable_post_id` candidate never poisons
  // this set for a different, unrelated post that also lacks a post_url).
  accountedForPostUrls: Set<string>

  // decision 10: only a still-open (not yet revealed, not sitting in a
  // protected/closed-by-definition status) candidate is ever offered as a
  // match target — these three maps only ever contain open candidates.
  openCandidateByPostUrl: Map<string, string> // post_url -> source_ref
  openCandidateByCreatorLabel: Map<string, string> // "creator|||label" -> source_ref
  openSourceRefsByCreator: Map<string, string[]>

  // decision 8: a creator's full candidate history, any status — context
  // for system/snapshot continuity, distinct from the open-matching maps.
  allSourceRefsByCreator: Map<string, string[]>

  // In-memory copy of every loaded candidate, keyed by source_ref, so the
  // walk can read current state without re-hitting disk for every post.
  candidatesByRef: Map<string, { status: CandidateStatus; candidate: Candidate }>
}

const EXPIRY_DAYS = 21
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000

function creatorLabelKey(creator: string, label: string): string {
  return `${creator}|||${label}`
}

function emptyIndex(): CandidateIndex {
  return {
    accountedForPostUrls: new Set(),
    openCandidateByPostUrl: new Map(),
    openCandidateByCreatorLabel: new Map(),
    openSourceRefsByCreator: new Map(),
    allSourceRefsByCreator: new Map(),
    candidatesByRef: new Map(),
  }
}

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key)
  if (existing) existing.push(value)
  else map.set(key, [value])
}

function removeFrom(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key)
  if (existing) map.set(key, existing.filter((v) => v !== value))
}

// Adds one candidate's entries to the index. Assumes it isn't already
// indexed under this source_ref — callers that might be re-indexing an
// updated candidate must call `removeFromIndex` first (see `upsert`).
function addToIndex(
  index: CandidateIndex,
  status: CandidateStatus,
  candidate: Candidate,
): void {
  const sourceRef = candidate.payload.source_ref
  if (!sourceRef) return // defensive — writeCandidate always enforces this on disk

  index.candidatesByRef.set(sourceRef, { status, candidate })

  for (const postUrl of candidate.contributing_posts) {
    if (postUrl) index.accountedForPostUrls.add(postUrl)
  }

  const creator = candidate.payload.author?.forum_username
  if (creator) pushTo(index.allSourceRefsByCreator, creator, sourceRef)

  const isOpen = !isProtectedStatus(status) && !isRevealed(candidate)
  if (!isOpen) return

  for (const postUrl of candidate.contributing_posts) {
    if (postUrl) index.openCandidateByPostUrl.set(postUrl, sourceRef)
  }
  if (creator) {
    pushTo(index.openSourceRefsByCreator, creator, sourceRef)
    for (const label of candidate.forum_labels) {
      index.openCandidateByCreatorLabel.set(creatorLabelKey(creator, label), sourceRef)
    }
  }
}

// Removes a candidate's entries from every map — used before re-adding an
// updated version of it (`upsert`), so stale open-candidate entries from
// before a status/content change (e.g. a reveal closing it) don't linger.
function removeFromIndex(index: CandidateIndex, sourceRef: string): void {
  const existing = index.candidatesByRef.get(sourceRef)
  if (!existing) return

  index.candidatesByRef.delete(sourceRef)

  for (const [postUrl, ref] of index.openCandidateByPostUrl) {
    if (ref === sourceRef) index.openCandidateByPostUrl.delete(postUrl)
  }
  for (const [key, ref] of index.openCandidateByCreatorLabel) {
    if (ref === sourceRef) index.openCandidateByCreatorLabel.delete(key)
  }
  for (const creator of index.openSourceRefsByCreator.keys()) {
    removeFrom(index.openSourceRefsByCreator, creator, sourceRef)
  }
  for (const creator of index.allSourceRefsByCreator.keys()) {
    removeFrom(index.allSourceRefsByCreator, creator, sourceRef)
  }
  // accountedForPostUrls is deliberately left alone — within a single run
  // it only ever needs to grow, never shrink (see saveCandidate).
}

function upsert(index: CandidateIndex, status: CandidateStatus, candidate: Candidate): void {
  const sourceRef = candidate.payload.source_ref
  if (!sourceRef) {
    throw new Error('candidate-index: candidate.payload.source_ref is required')
  }
  removeFromIndex(index, sourceRef)
  addToIndex(index, status, candidate)
}

export async function buildCandidateIndex(baseDir: string): Promise<CandidateIndex> {
  const index = emptyIndex()
  for (const { status, candidate } of await readAllCandidates(baseDir)) {
    addToIndex(index, status, candidate)
  }
  return index
}

export function isPostAccountedFor(index: CandidateIndex, postUrl: string): boolean {
  return postUrl !== '' && index.accountedForPostUrls.has(postUrl)
}

export function findOpenCandidateByPostUrl(
  index: CandidateIndex,
  postUrl: string,
): Candidate | null {
  const sourceRef = index.openCandidateByPostUrl.get(postUrl)
  return sourceRef ? index.candidatesByRef.get(sourceRef)?.candidate ?? null : null
}

// Splits a composite label like "1/2" or "1 vs 2" into its parts — found
// necessary against real data (decision 15's full trial run): the model
// sometimes echoes back a whole pair's joined label (matching how
// `candidateSummary` formats `forum_labels` for context, e.g.
// "forum_labels=1/2") instead of picking one of the two individual clip
// labels a reveal/vote actually needs to resolve against.
function splitCompositeLabel(label: string): string[] {
  return label.split(/\s*(?:\/|vs\.?|and|&|-)\s*/i).filter(Boolean)
}

export function findOpenCandidateByCreatorLabel(
  index: CandidateIndex,
  creator: string,
  label: string,
): Candidate | null {
  const direct = index.openCandidateByCreatorLabel.get(creatorLabelKey(creator, label))
  if (direct) return index.candidatesByRef.get(direct)?.candidate ?? null

  for (const part of splitCompositeLabel(label)) {
    if (part === label) continue
    const sourceRef = index.openCandidateByCreatorLabel.get(creatorLabelKey(creator, part))
    if (sourceRef) return index.candidatesByRef.get(sourceRef)?.candidate ?? null
  }

  return null
}

export function getOpenCandidatesForCreator(index: CandidateIndex, creator: string): Candidate[] {
  return (index.openSourceRefsByCreator.get(creator) ?? [])
    .map((ref) => index.candidatesByRef.get(ref)?.candidate)
    .filter((c): c is Candidate => c !== undefined)
}

export function getAllCandidatesForCreator(index: CandidateIndex, creator: string): Candidate[] {
  return (index.allSourceRefsByCreator.get(creator) ?? [])
    .map((ref) => index.candidatesByRef.get(ref)?.candidate)
    .filter((c): c is Candidate => c !== undefined)
}

// Every currently-open candidate thread-wide, across every creator —
// decision 10's cross-author fallback context: a voter's post needs
// visibility into a *different* author's open candidates, not just their
// own. Net effect (decision 10): this set stays small in practice, bounded
// by however many tests are simultaneously mid-flight, not by thread
// length, since reveal-closing and 21-day expiry both remove candidates
// from it continuously.
export function getAllOpenCandidates(index: CandidateIndex): Candidate[] {
  const allRefs = new Set<string>()
  for (const refs of index.openSourceRefsByCreator.values()) {
    for (const ref of refs) allRefs.add(ref)
  }

  return [...allRefs]
    .map((ref) => index.candidatesByRef.get(ref)?.candidate)
    .filter((c): c is Candidate => c !== undefined)
}

// The single entry point extraction logic should use to persist any
// candidate change — writes to disk (creating fresh, or moving from
// wherever it previously lived if its status changed) and keeps the
// in-memory index consistent, so callers never need to reason about file
// moves directly. Refuses to write into a protected status's *source* if
// that would silently overwrite a human/committed decision — callers must
// not attempt to move a candidate out of `approved`/`ingested_*`/`expired`.
export async function saveCandidate(
  index: CandidateIndex,
  baseDir: string,
  status: CandidateStatus,
  candidate: Candidate,
): Promise<void> {
  const sourceRef = candidate.payload.source_ref
  if (!sourceRef) throw new Error('saveCandidate: candidate.payload.source_ref is required')

  const existing = index.candidatesByRef.get(sourceRef)
  if (existing && isProtectedStatus(existing.status) && existing.status !== status) {
    throw new Error(
      `saveCandidate: refusing to move "${sourceRef}" out of protected status "${existing.status}"`,
    )
  }

  await writeCandidate(baseDir, status, candidate)
  if (existing && existing.status !== status) {
    await deleteCandidate(baseDir, existing.status, sourceRef)
  }

  upsert(index, status, candidate)
}

// decision 10: sweeps every currently-open candidate, expiring (moving to
// `expired/` on disk, decision 3) any whose own test-defining post is more
// than 21 days older than `currentPostTimestamp` — the walk's clock, not
// wall-clock time, since this is historical data. Call before evaluating
// each post in the walk, including a skipped one (decision 16), so the
// clock keeps advancing even when nothing calls the model for that post.
// A candidate with no resolvable `created_at` (decision 10's
// missing_timestamp path) never expires — there's no clock to check it
// against.
export async function sweepExpiredCandidates(
  index: CandidateIndex,
  baseDir: string,
  currentPostTimestamp: string,
): Promise<void> {
  const now = Date.parse(currentPostTimestamp)
  if (Number.isNaN(now)) return

  const openEntries = [...index.candidatesByRef.values()].filter(
    (entry) => !isProtectedStatus(entry.status) && !isRevealed(entry.candidate),
  )

  for (const entry of openEntries) {
    const createdAt = Date.parse(entry.candidate.created_at)
    if (Number.isNaN(createdAt)) continue
    if (now - createdAt <= EXPIRY_MS) continue

    await saveCandidate(index, baseDir, 'expired', entry.candidate)
  }
}
