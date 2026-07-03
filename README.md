# Audiophile Compare

A blind A/B comparison app for hi-fi audio systems. Listeners vote on whether
they can hear a difference between two system snapshots on a shared recording,
without knowing which clip is which until the test is revealed.

Built with Next.js 16 (App Router), Supabase (Postgres + Auth), Tailwind CSS,
and deployed on Vercel.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

See [docs/dependencies.md](docs/dependencies.md) for full setup requirements
including Node.js version, Playwright browsers, and the Supabase CLI.

## Documentation

### Setup & deployment

| Document | Contents |
|---|---|
| [docs/dependencies.md](docs/dependencies.md) | All required tools, npm packages, and environment variables |
| [docs/supabase-environments.md](docs/supabase-environments.md) | Two-project Supabase strategy (staging + production), schema deployment |
| [docs/supabase-database-reset.md](docs/supabase-database-reset.md) | Database reset, recovery, and migration troubleshooting |
| [docs/vercel-setup.md](docs/vercel-setup.md) | Vercel project configuration and branch-to-environment mapping |
| [docs/google-oauth.md](docs/google-oauth.md) | Google OAuth setup for Supabase Auth |

### Testing

| Document | Contents |
|---|---|
| [docs/TESTING.md](docs/TESTING.md) | Unit test suite (Vitest): all test files, counts, and coverage commands |
| [docs/end-to-end-testing.md](docs/end-to-end-testing.md) | E2E tests (Playwright): design decisions, spec coverage, CI strategy |
| [docs/manual-testing-setup.md](docs/manual-testing-setup.md) | Step-by-step manual verification of the full app flow |

## Background

[docs/audiophile-compare-app-specification.md](docs/audiophile-compare-app-specification.md) describes the rationale and design decisions behind the service: the problem being solved, user personas, user stories, the BYOS media model, system catalogue and track navigation concepts, listening technique governance, and a log of key architectural decisions.

## AI context

These files in `__claude_context__/` provide architectural context for AI coding assistants.
Load `core.md` first, then the file for your task:

| File | Contents |
|---|---|
| [__claude_context__/core.md](__claude_context__/core.md) | Stack, file layout, deployment topology, server/client rules, skill routing guide |
| [__claude_context__/api-conventions.md](__claude_context__/api-conventions.md) | API route patterns, auth checks, security rules, response format, programmatic access |
| [__claude_context__/components.md](__claude_context__/components.md) | Component patterns, MediaPlayer contracts, wizard state, mobile responsiveness, error boundaries |
| [__claude_context__/testing.md](__claude_context__/testing.md) | Unit and E2E conventions, test inventory, vitest mocks, Playwright strategy |
| [__claude_context__/audiophile-compare-schema.md](__claude_context__/audiophile-compare-schema.md) | Complete database schema, RLS policies, query patterns, auth triggers |
| [__claude_context__/build-history.md](__claude_context__/build-history.md) | Build step log (1–18 with implementation notes), deferred feature notes (owned storage, mobile app) |
| [__claude_context__/build-history.md](__claude_context__/build-history.md) | Build step log (1–18), deferred feature notes (owned storage, mobile app) |

