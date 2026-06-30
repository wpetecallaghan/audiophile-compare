# End-to-End Testing

E2E tests run against the live staging database using [Playwright](https://playwright.dev).
They verify complete user flows from the browser through the Next.js app and into Supabase —
things that unit tests cannot cover.

---

## Core design decisions

### Framework: Playwright

Native Next.js support, `storageState` for session reuse, parallel test execution
with `workers: 1` (staging DB cannot handle concurrent writes safely), and
built-in trace/screenshot capture on failure.

### Authentication: Supabase Admin API

Magic links and Google OAuth both require external services (email inbox, Google UI).
Neither is viable in a headless test runner. Instead, `global-setup.ts` uses the
Supabase Admin API to generate a magic link URL directly, navigates to it in a
headless browser, and saves the resulting session cookies to
`playwright/.auth/user.json`. Every test that needs auth loads from that file —
auth happens **once per test run**, not once per test.

Google OAuth is not tested E2E. The unit tests for `OAuthButtons` verify the
correct Supabase API call is made; testing the OAuth dance itself requires
mocking Google's servers, which is out of scope for a staging integration test.

### Test data strategy: [E2E] prefix + dedicated test user

Running against the live staging database means tests cannot wipe tables.
Three rules keep test data safe and identifiable:

1. **Dedicated test user** — a fixed `E2E_TEST_USER_EMAIL` account exists in
   staging. All E2E-created data is owned by this user.
2. **Identifiable prefix** — all created names begin with `[E2E]`
   (e.g., `[E2E] Lejonklou Sagatun`, `[E2E] Tidal listening test`).
3. **Teardown** — `global-teardown.ts` deletes every `[E2E]`-prefixed record
   owned by the test user at the end of every run. Uses the Supabase admin
   client so RLS does not interfere.

Tests that read existing staging data (e.g., the public feed) must be read-only
and must not assert on exact record counts — they assert on structure.

---

## File structure

```
e2e/
  global-setup.ts          ← generate magic link → auth browser → save storageState
  global-teardown.ts       ← delete all [E2E]-prefixed records owned by test user
  helpers/
    admin.ts               ← Supabase admin client; seed and cleanup helpers
    routes.ts              ← typed URL builders
  tests/
    public-feed.spec.ts    ← unauthenticated user: feed, redirects
    auth.spec.ts           ← session state: nav links, sign-out, redirectTo preservation
    systems.spec.ts        ← create system, edit system, add snapshot, edit snapshot
    test-creation.spec.ts  ← full wizard: track → snapshots → clips → publish
    voting.spec.ts         ← cast vote, hidden/visible tally, reveal, update vote
    profile.spec.ts        ← update display name
playwright.config.ts
```

---

## Test coverage

### `public-feed.spec.ts` — no auth required

| # | Scenario |
|---|---|
| 1 | Home page loads without a session cookie |
| 2 | Test cards have expected structure (title, status badge) when tests exist |
| 3 | Visiting `/systems` redirects to `/login?redirectTo=%2Fsystems` |
| 4 | The login page shows both the magic link form and the Google sign-in button |

### `auth.spec.ts` — auth session state

| # | Scenario |
|---|---|
| 1 | Authenticated header shows Tests / Systems / Tracks / Profile nav links |
| 2 | Sign out clears the session: header shows "Sign in" after |
| 3 | `redirectTo` is preserved: `/systems` → login → lands back on `/systems` |

### `systems.spec.ts` — system CRUD (creates and cleans up `[E2E]` data)

| # | Scenario |
|---|---|
| 1 | Create a system: fill form → submit → land on detail page with correct name |
| 2 | Edit the system name and description: save → detail page shows updated values |
| 3 | Add a snapshot to the system: fill label → submit → snapshot appears in list |
| 4 | Edit a snapshot label: save → updated label shown |
| 5 | Non-owner does not see the Edit button on a system they don't own |

### `test-creation.spec.ts` — full wizard (seeds a track and two systems)

| # | Scenario |
|---|---|
| 1 | Navigate to `/tests/new` — step indicator shows "1 Track" as active |
| 2 | Search for and select a seeded track — Continue advances to step 2 |
| 3 | Select Snapshot A and Snapshot B from seeded systems — Continue advances |
| 4 | Enter valid YouTube URLs for clips A and B — Verify succeeds for both |
| 5 | Continue to step 4 — Publish test creates the test and lands on detail page |
| 6 | Published test appears on the home feed |

### `voting.spec.ts` — voting flow (seeds a complete published test)

| # | Scenario |
|---|---|
| 1 | Before voting: vote tally is hidden; vote count is visible |
| 2 | Cast a vote: select a clip preference for one technique → Save votes |
| 3 | After voting: tally bars are visible for the voted technique |
| 4 | Update the vote: radios pre-filled; save changes the tally |
| 5 | Creator can reveal the test: Reveal button visible; tally shown to all after reveal |

### `profile.spec.ts`

| # | Scenario |
|---|---|
| 1 | Profile page shows the current display name |
| 2 | Update display name → save → "Display name updated." confirmation shown |

---

## Environment variables

Add to `.env.local` (local runs) and to Vercel / GitHub Actions (CI):

```bash
# Required for E2E tests — never committed
SUPABASE_SERVICE_ROLE_KEY=<staging service role key>
E2E_TEST_USER_EMAIL=e2e-tests@example.com
E2E_BASE_URL=http://localhost:3000        # local
# E2E_BASE_URL=https://your-preview.vercel.app   # CI
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are already
in `.env.local` and must point to the staging project.

---

## Setup: create the staging test user

The `E2E_TEST_USER_EMAIL` account must exist in the staging Supabase project
before the first test run. Create it once via the Supabase dashboard:

1. **Authentication → Users → Invite user**
2. Enter the E2E email address
3. Confirm the user (or use the Admin API to `createUser` with `email_confirm: true`)

The global setup will then generate magic links for this user on every run.

---

## Running the tests

```bash
# Start the dev server first (or set E2E_BASE_URL to a Vercel preview URL)
npm run dev

# Run all E2E tests
npm run test:e2e

# Run with Playwright's interactive UI
npm run test:e2e:ui

# Run with debug inspector
npm run test:e2e:debug

# Run a specific spec
npx playwright test e2e/tests/systems.spec.ts
```

---

## CI integration

E2E tests should **not** run on every push — they are slower and write to the
staging database. Recommended triggers:

- **On merge to `staging` branch** — verifies the staging Vercel deployment is
  healthy; `E2E_BASE_URL` set to the staging Vercel URL
- **On demand** — `workflow_dispatch` in GitHub Actions before merging to `main`

Do not run E2E on feature branches or PRs — concurrent runs against the same
staging database can conflict on test data even with the `[E2E]` prefix.

---

## Teardown: deletion order

The schema has no `ON DELETE CASCADE` constraints, so teardown deletes in
dependency order:

```
votes            (references tests)
clip_mapping     (references tests + clips)
clips            (references tests)
tests            (references tracks + system_snapshots)
system_snapshots (references systems)
systems
tracks
```

All deletions are scoped to `[E2E]`-prefixed records owned by the test user.
