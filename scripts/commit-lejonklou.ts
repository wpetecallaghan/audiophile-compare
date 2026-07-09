// Standalone script — POSTs every approved candidate to a deployed
// environment's /api/internal/ingest and moves it along the
// approved -> ingested/staging -> ingested/production chain
// (build-history-ingestion.md step 36). Thin argv-parsing wrapper; all
// real logic lives in lib/ingestion/commit.ts, matching every other
// script in this pipeline.
// Run manually:
//   tsx scripts/commit-lejonklou.ts --env staging|production [--base-url <url>] [candidates-dir]

import { commitEnvironment, type CommitEnv } from '../lib/ingestion/commit'

// Same as extract-lejonklou.ts — a standalone tsx script doesn't
// auto-load .env.local the way `next dev` does.
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local — fall through to whatever's already in process.env
}

// Two separate local env vars per concern, not one ambient value —
// staging and production each have their own secret and their own
// deployed URL, and this script needs the right pair for whichever
// --env was passed without requiring .env.local to be edited between a
// staging run and the production run that follows it (docs/vercel-setup.md).
const SECRET_ENV_VAR: Record<CommitEnv, string> = {
  staging: 'INGEST_SECRET_STAGING',
  production: 'INGEST_SECRET_PRODUCTION',
}
const BASE_URL_ENV_VAR: Record<CommitEnv, string> = {
  staging: 'COMMIT_BASE_URL_STAGING',
  production: 'COMMIT_BASE_URL_PRODUCTION',
}

function usageError(): never {
  console.error(
    'Usage: tsx scripts/commit-lejonklou.ts --env staging|production [--base-url <url>] [candidates-dir]',
  )
  process.exit(1)
}

// --env stays a required, no-default flag (build-history-ingestion.md
// step 36 decision 5) — the one choice that must never be implicit. The
// base URL is a named --base-url override; when omitted, it falls back
// to the per-environment env var above rather than a single ambient
// default, so an override still can't accidentally point at the wrong
// environment.
function parseArgs(argv: string[]): { env: CommitEnv; baseUrlOverride?: string; candidatesDir: string } {
  const envIndex = argv.indexOf('--env')
  const env = envIndex >= 0 ? argv[envIndex + 1] : undefined
  if (env !== 'staging' && env !== 'production') usageError()

  const baseUrlIndex = argv.indexOf('--base-url')
  const baseUrlOverride = baseUrlIndex >= 0 ? argv[baseUrlIndex + 1] : undefined
  if (baseUrlIndex >= 0 && !baseUrlOverride) usageError()

  // Only ever consume a flag's own two indices as a pair, and only when
  // that flag was actually found — gating on the *found* flag's index
  // (envIndex >= 0), not on whether "index + 1" itself happens to be
  // non-negative. A naive `[i => i >= 0]` filter on the computed "+1"
  // values doesn't work: when a flag is absent its index is -1, and
  // -1 + 1 = 0 passes an ">= 0" check just as validly as a real index 0
  // does, wrongly swallowing a genuine positional argument that sits
  // first on the command line (e.g. candidates-dir before --env).
  const consumed = new Set([
    ...(envIndex >= 0 ? [envIndex, envIndex + 1] : []),
    ...(baseUrlIndex >= 0 ? [baseUrlIndex, baseUrlIndex + 1] : []),
  ])
  const positional = argv.filter((_, i) => !consumed.has(i))
  const [candidatesDir = 'scripts/output/candidates'] = positional

  return { env, baseUrlOverride, candidatesDir }
}

async function main() {
  const { env, baseUrlOverride, candidatesDir } = parseArgs(process.argv.slice(2))

  const secretVar = SECRET_ENV_VAR[env]
  const secret = process.env[secretVar]
  if (!secret) {
    console.error(`commit-lejonklou: ${secretVar} is not set (checked .env.local and process.env)`)
    process.exit(1)
  }

  const baseUrlVar = BASE_URL_ENV_VAR[env]
  const baseUrl = baseUrlOverride ?? process.env[baseUrlVar]
  if (!baseUrl) {
    console.error(
      `commit-lejonklou: no base URL — pass --base-url <url> or set ${baseUrlVar} (checked .env.local and process.env)`,
    )
    process.exit(1)
  }

  const { committed, failed } = await commitEnvironment(candidatesDir, baseUrl, secret, env)

  console.log(`Committed ${committed} candidate(s) to ${env} (${baseUrl}), ${failed} failed.`)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
