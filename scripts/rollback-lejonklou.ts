// Standalone script — deletes a committed environment's ingested test
// data (votes, clip_mapping, clips, tests — never system_snapshots/
// systems/tracks, see lib/ingestion/rollback.ts) for every candidate
// currently sitting in that environment's ingested folder, and moves the
// local candidate files back to the folder they were committed from so
// they're immediately ready to recommit (build-history-ingestion.md
// step 38). Thin argv-parsing wrapper; all real logic lives in
// lib/ingestion/rollback.ts, matching every other script in this
// pipeline.
// Run manually:
//   tsx scripts/rollback-lejonklou.ts --env staging|production [--dry-run] [candidates-dir]

import { rollbackEnvironment, type RollbackEnv } from '../lib/ingestion/rollback'

// Same as extract-lejonklou.ts / commit-lejonklou.ts — a standalone tsx
// script doesn't auto-load .env.local the way `next dev` does.
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local — fall through to whatever's already in process.env
}

// Two separate local env vars per environment, same reasoning as
// commit-lejonklou.ts's INGEST_SECRET_STAGING/PRODUCTION and
// COMMIT_BASE_URL_STAGING/PRODUCTION — a single ambient
// NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (what the deployed
// app itself uses) can only ever represent one environment at a time.
const SUPABASE_URL_ENV_VAR: Record<RollbackEnv, string> = {
  staging: 'SUPABASE_URL_STAGING',
  production: 'SUPABASE_URL_PRODUCTION',
}
const SERVICE_ROLE_KEY_ENV_VAR: Record<RollbackEnv, string> = {
  staging: 'SUPABASE_SERVICE_ROLE_KEY_STAGING',
  production: 'SUPABASE_SERVICE_ROLE_KEY_PRODUCTION',
}

function usageError(): never {
  console.error(
    'Usage: tsx scripts/rollback-lejonklou.ts --env staging|production [--dry-run] [candidates-dir]',
  )
  process.exit(1)
}

function parseArgs(argv: string[]): { env: RollbackEnv; dryRun: boolean; candidatesDir: string } {
  const envIndex = argv.indexOf('--env')
  const env = envIndex >= 0 ? argv[envIndex + 1] : undefined
  if (env !== 'staging' && env !== 'production') usageError()

  const dryRunIndex = argv.indexOf('--dry-run')
  const dryRun = dryRunIndex >= 0

  const consumed = new Set([
    ...(envIndex >= 0 ? [envIndex, envIndex + 1] : []),
    ...(dryRunIndex >= 0 ? [dryRunIndex] : []),
  ])
  const positional = argv.filter((_, i) => !consumed.has(i))
  const [candidatesDir = 'scripts/output/candidates'] = positional

  return { env, dryRun, candidatesDir }
}

async function main() {
  const { env, dryRun, candidatesDir } = parseArgs(process.argv.slice(2))

  const urlVar = SUPABASE_URL_ENV_VAR[env]
  const keyVar = SERVICE_ROLE_KEY_ENV_VAR[env]
  const supabaseUrl = process.env[urlVar]
  const supabaseServiceRoleKey = process.env[keyVar]

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error(
      `rollback-lejonklou: ${urlVar} and ${keyVar} must both be set (checked .env.local and process.env)`,
    )
    process.exit(1)
  }

  const { sourceRefs, testIds } = await rollbackEnvironment(
    candidatesDir,
    supabaseUrl,
    supabaseServiceRoleKey,
    env,
    dryRun,
  )

  if (dryRun) {
    console.log(
      `[dry run] Would delete ${testIds.length} test(s) (of ${sourceRefs.length} candidate(s) checked) ` +
        `from ${env} and move their candidate files back:`,
    )
    for (const ref of sourceRefs) console.log(`  ${ref}`)
    return
  }

  console.log(
    `Deleted ${testIds.length} test(s) from ${env} and moved ${sourceRefs.length} candidate file(s) back.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
