// Step 36's real logic — POSTs approved candidates to a deployed
// environment's /api/internal/ingest and moves them along the
// approved -> ingested/staging -> ingested/production chain. Kept out of
// scripts/commit-lejonklou.ts (which stays a thin argv-parsing wrapper),
// matching the lib/scripts split every other step in this pipeline
// already uses (extract-post.ts/extract-lejonklou.ts,
// create-placeholder-author.ts/the route that calls it).
import {
  writeCandidate,
  moveCandidate,
  listCandidatesInStatus,
  CandidateStatusValue,
  type Candidate,
  type CandidateStatus,
} from './extract/candidate'

export type CommitEnv = 'staging' | 'production'

// Enforces "staging first" at the tooling level: production's source is
// staging's own destination, not `approved/` — a candidate physically
// cannot reach production without already having been committed to
// staging (build-history-ingestion.md step 36 decision 1).
const ENVIRONMENT_FOLDERS: Record<CommitEnv, { from: CandidateStatus; to: CandidateStatus }> = {
  staging: { from: CandidateStatusValue.APPROVED, to: CandidateStatusValue.INGESTED_STAGING },
  production: { from: CandidateStatusValue.INGESTED_STAGING, to: CandidateStatusValue.INGESTED_PRODUCTION },
}

export type CommitResult = { testId: string; alreadyImported: boolean } | { error: string }

// Extracts a human-readable message from a non-2xx response body. The
// real route always returns `{ error: string }` (app/api/internal/
// ingest/route.ts), but a request that never actually reaches it —
// intercepted upstream by Vercel Deployment Protection on a protected
// preview/staging domain, for example — can return a differently-shaped
// JSON error instead (found for real: staging returned a truthy but
// non-string `error` field, which without this check silently rendered
// as the useless literal string "[object Object]"). Never trust `error`
// is a string just because the field exists.
function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error
    if (typeof error === 'string' && error) return error
    if (error) return JSON.stringify(error)
  }
  return `HTTP ${status}`
}

// POSTs one candidate's payload to the real route. `alreadyImported` on a
// 2xx response is decision 3's idempotency signal, not an error — a
// repeat commit of the same source_ref is expected and still counts as
// success. Field name confirmed against the real route
// (app/api/internal/ingest/route.ts) and api-conventions.md's documented
// contract: the JSON response is camelCase `alreadyImported`, distinct
// from the `already_imported` field name the underlying Postgres RPC
// uses internally.
//
// Never throws — a network error, a non-JSON response body, or any other
// unexpected failure becomes a `{ error }` result like any other failure
// mode, so a single bad candidate can't abort commitEnvironment's whole
// batch loop (found necessary for real: an earlier version let
// `response.json()` throw uncaught, which would have stopped processing
// every remaining candidate the moment one candidate's response was
// malformed).
export async function commitCandidate(
  baseUrl: string,
  secret: string,
  candidate: Candidate,
): Promise<CommitResult> {
  try {
    // Deployment-protected domains (e.g. a Vercel Preview/staging URL
    // with SSO protection enabled) reject any request with no bypass
    // credential before it ever reaches the app's own routes — same
    // header playwright.config.ts / e2e/helpers/auth.ts already send for
    // the E2E suite against the same kind of protected URL.
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    const response = await fetch(`${baseUrl}/api/internal/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ingest-secret': secret,
        ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
      },
      body: JSON.stringify(candidate.payload),
    })

    const body: unknown = await response.json()

    if (!response.ok) {
      return { error: extractErrorMessage(body, response.status) }
    }

    const { testId, alreadyImported } = body as { testId?: string; alreadyImported?: boolean }
    return { testId: testId!, alreadyImported: alreadyImported ?? false }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// The per-environment loop: list the environment's source folder (never
// `readAllCandidates`, which would also see every other status), commit
// each candidate, and move it on success or record the failure in place
// on error. A non-2xx response's error is free text (the real route
// returns `{ error: string }`, not a fixed set of codes), so per step 35
// decision 1's typed-issues/free-text-notes split it goes in `notes`,
// never `issues` — `issues` stays reserved for the enum `IssueCode`
// union. The file stays in its source folder either way (via
// `writeCandidate`, not `moveCandidate` — status doesn't change), so a
// re-run retries it rather than losing it.
export async function commitEnvironment(
  baseDir: string,
  baseUrl: string,
  secret: string,
  env: CommitEnv,
): Promise<{ committed: number; failed: number }> {
  const { from, to } = ENVIRONMENT_FOLDERS[env]
  const candidates = await listCandidatesInStatus(baseDir, from)

  let committed = 0
  let failed = 0

  for (const candidate of candidates) {
    const sourceRef = candidate.payload.source_ref
    if (!sourceRef) continue // defensive — writeCandidate always enforces this on disk

    const result = await commitCandidate(baseUrl, secret, candidate)

    if ('error' in result) {
      candidate.notes = [...(candidate.notes ?? []), `commit-lejonklou (${env}): ${result.error}`]
      await writeCandidate(baseDir, from, candidate)
      failed++
      console.error(`${sourceRef}: commit failed — ${result.error}`)
      continue
    }

    await moveCandidate(baseDir, sourceRef, from, to)
    committed++
    console.log(
      `${sourceRef}: committed (${result.alreadyImported ? 'already imported' : 'new'}) -> ${to}`,
    )
  }

  return { committed, failed }
}
