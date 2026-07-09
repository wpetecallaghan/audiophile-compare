// Step 38's real logic — deletes a committed environment's ingested test
// data for every candidate currently sitting in that environment's
// commit.ts destination folder, and moves the local candidate files back
// to commit.ts's source folder so they're immediately ready to recommit.
// Kept out of scripts/rollback-lejonklou.ts (thin CLI wrapper), same
// lib/scripts split as commit.ts/commit-lejonklou.ts.
import { createAdminClient } from '../supabase/admin'
import {
  moveCandidate,
  listCandidatesInStatus,
  CandidateStatusValue,
  type CandidateStatus,
} from './extract/candidate'

export type RollbackEnv = 'staging' | 'production'

// The exact reverse of commit.ts's ENVIRONMENT_FOLDERS: rollback moves a
// candidate back to whichever folder was that environment's commit
// *source*, undoing exactly one commitEnvironment call.
const ROLLBACK_FOLDERS: Record<RollbackEnv, { from: CandidateStatus; to: CandidateStatus }> = {
  staging: { from: CandidateStatusValue.INGESTED_STAGING, to: CandidateStatusValue.APPROVED },
  production: { from: CandidateStatusValue.INGESTED_PRODUCTION, to: CandidateStatusValue.INGESTED_STAGING },
}

async function deleteFrom(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  values: string[],
): Promise<void> {
  const { error } = await admin.from(table).delete().in(column, values)
  if (error) throw new Error(`rollback: failed deleting from ${table}: ${error.message}`)
}

// Deletes every test whose source_ref matches a candidate currently in
// this environment's ingested folder, in the same FK-safe order
// app/api/internal/ingest/__tests__/route.integration.test.ts's own
// cleanup already established: votes -> clip_mapping -> clips -> tests.
// Deliberately stops there — never touches system_snapshots/systems/
// tracks, since those can be legitimately shared with other tests
// (including a future recommit of these same candidates, which resolves
// them again rather than duplicating), so blind deletion there risks
// breaking something outside this rollback's actual scope.
//
// dryRun lists what would be deleted (source_refs and resolved test ids)
// without deleting or moving anything — this mutates real staging/
// production data otherwise, so a caller gets a chance to see the blast
// radius first.
export async function rollbackEnvironment(
  baseDir: string,
  supabaseUrl: string,
  supabaseServiceRoleKey: string,
  env: RollbackEnv,
  dryRun = false,
): Promise<{ sourceRefs: string[]; testIds: string[] }> {
  const { from, to } = ROLLBACK_FOLDERS[env]
  const candidates = await listCandidatesInStatus(baseDir, from)
  const sourceRefs = candidates
    .map((c) => c.payload.source_ref)
    .filter((ref): ref is string => Boolean(ref))

  if (sourceRefs.length === 0) return { sourceRefs: [], testIds: [] }

  const admin = createAdminClient(supabaseUrl, supabaseServiceRoleKey)

  const { data: tests, error: findError } = await admin
    .from('tests')
    .select('id')
    .in('source_ref', sourceRefs)

  if (findError) throw new Error(`rollback: failed to find tests: ${findError.message}`)

  const testIds = (tests ?? []).map((t) => t.id as string)

  if (dryRun) return { sourceRefs, testIds }

  if (testIds.length > 0) {
    await deleteFrom(admin, 'votes', 'test_id', testIds)
    await deleteFrom(admin, 'clip_mapping', 'test_id', testIds)
    await deleteFrom(admin, 'clips', 'test_id', testIds)
    await deleteFrom(admin, 'tests', 'id', testIds)
  }

  for (const sourceRef of sourceRefs) {
    await moveCandidate(baseDir, sourceRef, from, to)
  }

  return { sourceRefs, testIds }
}
