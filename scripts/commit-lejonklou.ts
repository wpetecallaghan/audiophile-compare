// Standalone script — POSTs every approved candidate to a deployed
// environment's /api/internal/ingest and moves it along the
// approved -> ingested/staging -> ingested/production chain
// (build-history-ingestion.md step 36). Thin argv-parsing wrapper; all
// real logic lives in lib/ingestion/commit.ts, matching every other
// script in this pipeline.
// Run manually:
//   tsx scripts/commit-lejonklou.ts <base-url> --env staging|production [candidates-dir]

import { commitEnvironment, type CommitEnv } from '../lib/ingestion/commit'

// Same as extract-lejonklou.ts — a standalone tsx script doesn't
// auto-load .env.local the way `next dev` does.
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local — fall through to whatever's already in process.env
}

// Two separate local env vars, not one ambient INGEST_SECRET — staging
// and production are provisioned with different secret values on Vercel
// (docs/vercel-setup.md), and this script needs the right one for
// whichever --env was passed without requiring .env.local to be edited
// between a staging run and the production run that follows it.
const SECRET_ENV_VAR: Record<CommitEnv, string> = {
  staging: 'INGEST_SECRET_STAGING',
  production: 'INGEST_SECRET_PRODUCTION',
}

function parseArgs(argv: string[]): { baseUrl: string; env: CommitEnv; candidatesDir: string } {
  const envIndex = argv.indexOf('--env')
  const env = envIndex >= 0 ? argv[envIndex + 1] : undefined
  const positional = argv.filter((_, i) => i !== envIndex && i !== envIndex + 1)
  const [baseUrl, candidatesDir = 'scripts/output/candidates'] = positional

  if (!baseUrl || (env !== 'staging' && env !== 'production')) {
    console.error(
      'Usage: tsx scripts/commit-lejonklou.ts <base-url> --env staging|production [candidates-dir]',
    )
    process.exit(1)
  }

  return { baseUrl, env, candidatesDir }
}

async function main() {
  const { baseUrl, env, candidatesDir } = parseArgs(process.argv.slice(2))

  const secretVar = SECRET_ENV_VAR[env]
  const secret = process.env[secretVar]
  if (!secret) {
    console.error(`commit-lejonklou: ${secretVar} is not set (checked .env.local and process.env)`)
    process.exit(1)
  }

  const { committed, failed } = await commitEnvironment(candidatesDir, baseUrl, secret, env)

  console.log(`Committed ${committed} candidate(s) to ${env}, ${failed} failed.`)
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
