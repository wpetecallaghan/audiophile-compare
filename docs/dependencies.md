# Dependencies

---

## Runtime: Node.js

Node.js 22 or later is required. Install via [nvm](https://github.com/nvm-sh/nvm)
(recommended) or directly from [nodejs.org](https://nodejs.org):

```bash
# With nvm
nvm install 22
nvm use 22

# Verify
node --version   # should print v22.x.x
```

---

## npm packages

All JavaScript dependencies are declared in `package.json`.

```bash
npm install
```

### Runtime dependencies

| Package | Purpose |
|---|---|
| `next` | Framework (App Router, Turbopack) |
| `next-intl` | i18n string resources (without-routing mode) |
| `react` / `react-dom` | UI rendering |
| `@supabase/supabase-js` | Supabase JS client |
| `@supabase/ssr` | Server-side Supabase client for Next.js (cookie handling) |
| `@vimeo/player` | Vimeo embed player SDK |
| `@types/youtube` | TypeScript types for the YouTube IFrame API |
| `class-variance-authority` | Defines the shared `Button`/`Badge` style variants (`components/ui/`) — see `components.md §12` |
| `clsx` | Merges conditional class lists; used by `components/ui/cn.ts` alongside `class-variance-authority` |

### Dev / test dependencies

| Package | Purpose |
|---|---|
| `vitest` | Unit test runner |
| `@vitest/coverage-v8` | V8 coverage reporting |
| `@vitest/ui` | Browser UI for Vitest |
| `@testing-library/react` | Component testing utilities |
| `@testing-library/jest-dom` | Custom DOM matchers |
| `@testing-library/user-event` | User interaction simulation |
| `msw` | API mocking (Mock Service Worker) |
| `jsdom` | DOM implementation for unit tests |
| `@playwright/test` | End-to-end test runner |
| `@vitejs/plugin-react` | React transform for Vite/Vitest |
| `typescript` | TypeScript compiler |
| `eslint` / `eslint-config-next` | Linting |
| `tailwindcss` / `postcss` | CSS framework |

---

## Playwright browsers

Playwright manages its own browser binaries separately from npm. After
`npm install`, install the browsers:

```bash
npx playwright install chromium
```

The E2E tests use Chromium only. To install all browsers (larger download):

```bash
npx playwright install
```

---

## Supabase CLI

Required to apply schema migrations and (optionally) run a local Supabase
instance. Install via [Homebrew](https://brew.sh) on macOS:

```bash
brew install supabase/tap/supabase
```

Or via npm (no Homebrew required):

```bash
npm install -g supabase
```

Verify:

```bash
supabase --version
```

See [supabase-environments.md](supabase-environments.md) for how to link and
push migrations to each project.

---

## Vercel CLI (optional)

Only needed if you want to run the app locally with production-equivalent
environment variables pulled from Vercel, or to deploy manually.

```bash
npm install -g vercel
vercel login
```

For day-to-day development, the Vercel CLI is not required — deployments
happen automatically on push via GitHub integration.

---

## Environment variables

### Local development — `.env.local`

Create `.env.local` in the project root (never committed):

```bash
# Supabase staging project
NEXT_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>

# Cron endpoint protection (any secret string)
CRON_SECRET=<random-secret>

# /version page access — comma-separated allowlist, no schema/role involved
ADMIN_EMAILS=you@example.com
```

Obtain the Supabase values from **Settings → API** in the staging project
dashboard. See [supabase-environments.md](supabase-environments.md) for
where to find each key.

### E2E tests — additional variables in `.env.local`

```bash
# Dedicated test user (must exist in the staging Supabase project)
E2E_TEST_USER_EMAIL=e2e-tests@example.com

# Base URL for the running app during E2E runs
E2E_BASE_URL=http://localhost:3000

# Only if E2E_BASE_URL points at a Vercel-protected preview/staging URL
VERCEL_AUTOMATION_BYPASS_SECRET=<protection bypass secret>
```

See [end-to-end-testing.md](end-to-end-testing.md) for how to create the
test user account in Supabase.

### Forum ingestion scripts — local-script-only, optional

Only needed if you're running the forum-ingestion pipeline
(`scripts/scrape-lejonklou.ts`, `extract-lejonklou.ts`,
`commit-lejonklou.ts`, `rollback-lejonklou.ts`) — not required for normal
app development. Full detail, rationale, and where to find each value:
[vercel-setup.md](vercel-setup.md).

```bash
# Extraction (Vercel AI Gateway)
AI_GATEWAY_API_KEY=<your key>

# Commit — two separate secrets, not one, so a single session can commit
# to staging then production without editing .env.local in between
INGEST_SECRET_STAGING=<staging INGEST_SECRET value>
INGEST_SECRET_PRODUCTION=<production INGEST_SECRET value>
COMMIT_BASE_URL_STAGING=https://staging.example.com
COMMIT_BASE_URL_PRODUCTION=https://example.com

# Rollback (interim ingestion-iteration tool — direct DB access)
SUPABASE_URL_STAGING=<staging NEXT_PUBLIC_SUPABASE_URL value>
SUPABASE_SERVICE_ROLE_KEY_STAGING=<staging SUPABASE_SERVICE_ROLE_KEY value>
SUPABASE_URL_PRODUCTION=<production NEXT_PUBLIC_SUPABASE_URL value>
SUPABASE_SERVICE_ROLE_KEY_PRODUCTION=<production SUPABASE_SERVICE_ROLE_KEY value>
```

### Vercel — production and preview environments

Set the following in the Vercel project dashboard under **Settings →
Environment Variables**:

| Variable | Scope |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production → production project URL; Preview → staging project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production → production anon key; Preview → staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production → production service role key; Preview → staging service role key |
| `CRON_SECRET` | Both |
| `ADMIN_EMAILS` | Both — comma-separated list of addresses allowed to view `/version` |
| `INGEST_SECRET` | Both — protects `POST /api/internal/ingest`; a different value per scope, read locally as `INGEST_SECRET_STAGING`/`INGEST_SECRET_PRODUCTION` above |

See [vercel-setup.md](vercel-setup.md) for step-by-step Vercel configuration.

---

## External services

| Service | Purpose | Sign up |
|---|---|---|
| [Supabase](https://supabase.com) | Database + Auth (two projects: staging + production) | Free tier; two active projects allowed |
| [Vercel](https://vercel.com) | Hosting + Vercel Cron | Free tier |
| [GitHub](https://github.com) | Source control + CI trigger for Vercel deploys | — |

No API keys are required for YouTube or Vimeo — both are accessed via their
public embed SDKs, which do not require authentication.
