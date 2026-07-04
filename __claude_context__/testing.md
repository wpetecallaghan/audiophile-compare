---
name: audiophile-compare-testing
description: >
  Unit and E2E test conventions, vitest configuration, mock patterns, full test
  inventory, and E2E coverage for the audiophile A/B comparison app. Load this
  when writing or modifying any test file, or when deciding where to place a
  new test.
---

# Audiophile Compare — Testing

---

## 1. Unit test conventions

- Pure logic (`lib/**/*.ts`) → `*.test.ts` → Vitest `node` environment
- React components (`components/**/*.tsx`) → `*.test.tsx` → Vitest `jsdom` environment (default)
- Tests live in a `__tests__/` folder adjacent to the file under test; `.spec.ts(x)` files placed directly next to the source file also work — both conventions are supported
- API routes are not unit-tested — they are covered by E2E tests against staging

**Override environment for a single file** (first line of the file):
```typescript
// @vitest-environment node
```

**Available test utilities** (all installed — use without adding dependencies):
- `vitest` — test runner
- `@testing-library/react` + `@testing-library/user-event` — component rendering and interaction
- `@testing-library/jest-dom` — custom DOM matchers (`toBeInTheDocument`, `toBeDisabled`, etc.)
- `msw` (Mock Service Worker) — intercept `fetch` calls at the network level; use when a component or utility makes real HTTP requests that can't be injected as props
- `jsdom` — DOM implementation for component tests

**Test commands:**
```bash
npm test                   # run all unit tests
npm run test:watch         # watch mode during development
npm run test:coverage      # coverage report
```

---

## 2. next-intl mock (vitest.setup.ts)

Both `next-intl` and `next-intl/server` are mocked with async factories that load
`messages/en.json` and perform simple `{variable}` substitution. Text assertions in
tests use actual English strings, not translation keys.

Do not remove or simplify this mock. Components use `useTranslations` (client) and
`getTranslations` (server); both must be mocked for tests to pass. Unit test assertions
remain human-readable and stay in sync automatically when copy in `en.json` changes.

---

## 3. What to test in wizard step components (e.g. `StepSnapshots`)

- **Rendering** — key UI elements; empty-state messages
- **Form open/close** — trigger shows/hides form; Cancel restores trigger; fields cleared on reopen
- **Validation** — submit disabled when required field empty; whitespace-only treated as empty
- **Submission** — success path (callback invoked, form hidden); API error path; network error path
- **Step-level callbacks** — verify `onComplete`, `onSnapshotCreated`, `onSystemCreated` receive correct args

Do **not** test the wizard shell (`CreateTestForm`) directly — its state management is validated
indirectly through the step tests.

---

## 4. Unit test inventory (24 files · 249 tests · all passing)

| File | Tests | What it covers |
|---|---|---|
| `__tests__/setup.test.ts` | 3 | Test infrastructure verification |
| `__tests__/LoginForm.test.tsx` | 12 | Email input, success/error states, Supabase OTP call, redirectTo |
| `__tests__/OAuthButtons.test.tsx` | 5 | Google button, signInWithOAuth call, redirectTo prop |
| `__tests__/supabase-client.test.ts` | 7 | Browser client creation, env vars |
| `__tests__/supabase-server.test.ts` | 10 | Async client, cookie handling, env vars |
| `components/__tests__/LoginWithPasswordForm.test.tsx` | 9 | signInWithPassword, error cases (invalid creds, unconfirmed email), redirect |
| `components/__tests__/RegisterForm.test.tsx` | 8 | signUp, validation (length, match), success state, already-registered error |
| `components/__tests__/ForgotPasswordForm.test.tsx` | 5 | resetPasswordForEmail, success message, onBack callback |
| `components/__tests__/SignOutButton.test.tsx` | 4 | signOut, window.location navigation, loading state |
| `components/__tests__/ProfileForm.test.tsx` | 13 | PATCH /api/profile, trim, validation, success/error states |
| `components/__tests__/ChangeEmailForm.test.tsx` | 4 | updateUser({ email }), confirmation message, loading state |
| `components/__tests__/ChangePasswordForm.test.tsx` | 9 | updateUser({ password }), validation, autoOpen prop, loading state |
| `components/media/__tests__/ABPlayer.test.tsx` | 1 | Renders A and B labels |
| `components/tests/__tests__/VoteForm.test.tsx` | 20 | Rendering, Other field visibility, validation, submission, pre-population |
| `components/tests/__tests__/StepSnapshots.test.tsx` | 28 | Open/close, validation, POST, onSnapshotCreated, inline system creation |
| `components/systems/__tests__/AddSnapshotForm.test.tsx` | 14 | Open/close, POST, router.refresh on success, validation |
| `components/systems/__tests__/CreateSystemForm.test.tsx` | 11 | POST /api/systems, validation, redirect, cancel |
| `components/systems/__tests__/EditSystemForm.test.tsx` | 12 | PATCH /api/systems/[id], validation, redirect, cancel |
| `components/systems/__tests__/SnapshotSection.test.tsx` | 20 | Display/edit mode, component rows, PATCH, router.refresh |
| `lib/clips/__tests__/detect-provider.test.ts` | 9 | YouTube / Vimeo / direct / unknown URL classification |
| `lib/clips/__tests__/to-clip-data.test.ts` | 5 | embed_id and canonical_url derivation for each provider |
| `lib/clips/__tests__/find-shared-clips.test.ts` | 9 | Shared track finder; side A/B selection; no shared tracks |
| `lib/votes/__tests__/compute-tally.test.ts` | 16 | Grouping, percentages, divergence detection, Other routing |
| `lib/votes/__tests__/compute-outcome.test.ts` | 8 | Win/loss/draw/no-votes/open per snapshot |

---

## 5. E2E conventions

- Framework: Playwright; Chromium only
- `workers: 1` — staging DB cannot handle concurrent writes safely
- Auth: `global-setup.ts` uses the Supabase Admin API to generate a magic link, then
  verifies it via `token_hash` against `app/auth/confirm/route.ts` (not the `code` flow —
  admin-issued links can't carry a PKCE `code_verifier`), saving session cookies to
  `playwright/.auth/user.json`. This shared session is reused by every authenticated
  spec **except** `zz-sign-out.spec.ts`, which needs its own disposable session — see
  that file for why.
- Google OAuth is not E2E-tested — `OAuthButtons` unit tests cover the API call.
- Staging/preview deployments sit behind Vercel SSO Deployment Protection —
  `VERCEL_AUTOMATION_BYPASS_SECRET` (§9) lets the automated browser through.

**Test data rules (all three are mandatory):**
1. A dedicated `E2E_TEST_USER_EMAIL` account must exist in the staging Supabase project (create once via dashboard — Authentication → Users → Invite user).
2. Every record created by a test is prefixed `[E2E]` (e.g. `[E2E] Lejonklou Sagatun`, `[E2E] Power cable comparison`).
3. `global-teardown.ts` deletes all `[E2E]`-prefixed records after every run using the admin client (bypasses RLS).

**Do not** assert on exact record counts when reading existing staging data — assert on structure only.

**Teardown deletion order** (no `ON DELETE CASCADE` — must respect FK constraints):
```
votes → clip_mapping → clips → tests → system_snapshots → systems → tracks
```

---

## 6. E2E coverage

| Spec | Scenarios |
|---|---|
| `public-feed.spec.ts` | Feed loads; unauthenticated header; test card structure; `/systems` → login redirect with redirectTo; `/profile` → login redirect; `/tracks` → login redirect |
| `auth.spec.ts` | Authenticated nav links (Tests / Systems / Tracks / Profile); redirectTo preserved through login flow |
| `systems.spec.ts` | Create system; edit name and description; add snapshot; edit snapshot label; systems list shows test user's systems |
| `test-creation.spec.ts` | Track search; full wizard (select track → snapshots → verify clips → publish) |
| `voting.spec.ts` | Tally hidden before voting; vote count visible; cast vote; update existing vote; creator can reveal |
| `profile.spec.ts` | Profile page loads; update display name; save disabled when name cleared |
| `zz-sign-out.spec.ts` | Sign out clears the session; header reverts to unauthenticated. Runs last — see file for why |

Step 17 is complete (24/24 passing against staging). Not covered by any spec
(optional future additions, not blocking): cross-check selector flow, feed
vote-count display.

---

## 7. Future — integration tests

Not yet implemented. When added, integration tests would cover:
- Database operations via a dedicated test Supabase project (not staging)
- Protected route access patterns at the API boundary
- Form submission workflows end-to-end through API routes

Unit tests mock Supabase internals; E2E tests run against the live staging DB. Integration tests would sit between them — testing API routes against a real (but disposable) database without a browser. No timeline set.

---

## 8. E2E environment variables

```bash
SUPABASE_SERVICE_ROLE_KEY=<staging service role key>
E2E_TEST_USER_EMAIL=e2e-tests@example.com
E2E_BASE_URL=http://localhost:3000              # local dev
# E2E_BASE_URL=https://your-preview.vercel.app # CI / staging
VERCEL_AUTOMATION_BYPASS_SECRET=<protection bypass secret>  # required if E2E_BASE_URL is Vercel-protected
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must also be set, pointing to staging.

`VERCEL_AUTOMATION_BYPASS_SECRET` is only needed when `E2E_BASE_URL` points at a
Vercel deployment with SSO Deployment Protection enabled (any staging/preview
URL, typically). Generate via `vercel project protection enable <project> --protection-bypass`,
then read the secret back with `vercel project protection <project>`. Not needed
for `http://localhost:3000`.

---

## 9. E2E trigger strategy

- **On merge to `staging`** — verifies the staging Vercel deployment; set `E2E_BASE_URL` to the staging Vercel URL.
- **On demand** (`workflow_dispatch`) — run before merging to `main`.
- **Not on feature branches or PRs** — concurrent staging writes can conflict even with the `[E2E]` prefix.

---

## 10. E2E test commands

```bash
npm run dev                                           # start dev server first (or use E2E_BASE_URL)
npm run test:e2e                                      # run all specs
npm run test:e2e:ui                                   # Playwright interactive UI
npm run test:e2e:debug                                # debug inspector
npx playwright test e2e/tests/systems.spec.ts         # single spec
```
