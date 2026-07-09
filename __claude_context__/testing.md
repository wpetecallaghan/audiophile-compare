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

## 4. Unit test inventory (38 files · 440 tests · all passing)

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
| `components/media/__tests__/ABPlayer.test.tsx` | 4 | Renders A and B labels; hideClipA/hideClipB hide that slot entirely; a Google Drive clip renders an iframe embed and the sibling's pause is a harmless no-op |
| `components/tests/__tests__/VoteForm.test.tsx` | 22 | Rendering, Other field visibility, validation, submission, pre-population, hasDeadClip |
| `components/tests/__tests__/StepSnapshots.test.tsx` | 28 | Open/close, validation, POST, onSnapshotCreated, inline system creation |
| `components/systems/__tests__/AddSnapshotForm.test.tsx` | 14 | Open/close, POST, router.refresh on success, validation |
| `components/systems/__tests__/CreateSystemForm.test.tsx` | 11 | POST /api/systems, validation, redirect, cancel |
| `components/systems/__tests__/EditSystemForm.test.tsx` | 12 | PATCH /api/systems/[id], validation, redirect, cancel |
| `components/systems/__tests__/SnapshotSection.test.tsx` | 27 | Display/edit mode, component rows, PATCH, router.refresh, delete confirm/cancel |
| `lib/clips/__tests__/detect-provider.test.ts` | 12 | YouTube / Vimeo / Google Drive / direct / unknown URL classification; a Drive folder link isn't misdetected as a file |
| `lib/clips/__tests__/to-clip-data.test.ts` | 6 | embed_id and canonical_url derivation for each provider, including Google Drive |
| `lib/clips/__tests__/find-shared-clips.test.ts` | 9 | Shared track finder; side A/B selection; no shared tracks |
| `lib/votes/__tests__/compute-tally.test.ts` | 16 | Grouping, percentages, divergence detection, Other routing |
| `lib/votes/__tests__/compute-outcome.test.ts` | 8 | Win/loss/draw/no-votes/open per snapshot |
| `lib/admin/__tests__/is-admin-email.test.ts` | 7 | ADMIN_EMAILS allowlist: unset, null/undefined email, match, no match, case-insensitivity, whitespace, empty entries |
| `lib/ingestion/__tests__/create-placeholder-author.test.ts` | 8 | Slugification (lowercase/strip/collapse/trim/truncate); resolves an existing (source, external_username) mapping without recreating; creates a new placeholder author; two usernames that slugify identically still get distinct placeholders; throws on auth user creation failure |
| `lib/ingestion/__tests__/ingest-test-payload.test.ts` | 25 | `validateIngestPayload`: accepts a fully populated payload (with and without votes, and with an optional `source_url`); rejects each missing required field on the top level, on `snapshot_a`/`snapshot_b`, and on a vote entry (`voter`, `chosen_label`, `technique_name`); accepts an optional, valid `created_at` and passes it through, is fine with no `created_at` at all (web-created tests never set it), rejects an unparseable one; the optional `knownTechniques` parameter accepts a listed technique, rejects an unlisted one, and is a no-op when omitted; `resolveTestTitle` (step 40 Part B): uses an explicit title, falls back to "system · artist – title" when omitted or whitespace-only (deduplicating when `snapshot_a`/`snapshot_b` share one system name — the real, expected case), joins both system names with `/` when they genuinely differ; `TUNE_METHOD_TECHNIQUE_NAME` is pinned against the real seeded `listening_techniques` row |
| `lib/tests/__tests__/format-snapshot-line.test.ts` | 5 | `formatSnapshotLine` (step 40 Part A): joins both snapshots with their system name; falls back to `'?'` when a snapshot has no joined system; shows only one side when the other is `null`; returns an empty string when both are `null` |
| `lib/ingestion/__tests__/commit.test.ts` | 16 | `commitCandidate` (generateObject-free, `fetch` mocked): POSTs the candidate's payload with the `x-ingest-secret` header, returns `{ testId, alreadyImported }` on 201/200 (including a 200 `alreadyImported: true` response, still treated as success), returns the real `{ error }` message on a non-2xx response, falls back to an `HTTP <status>` message when the error body has no `error` field, stringifies a non-string `error` field rather than the useless `"[object Object]"` (found for real against a Vercel-protected staging URL), sends `x-vercel-protection-bypass` only when `VERCEL_AUTOMATION_BYPASS_SECRET` is set (never otherwise), and returns `{ error }` rather than throwing when `fetch` rejects or the response body isn't valid JSON; `commitEnvironment`: `'staging'` reads only `approved/` and moves successes to `ingested_staging` (resolving the real nested `ingested/staging` path), `'production'` reads only `ingested_staging` and never touches `approved/` even when it still has entries, a failed candidate stays in its source folder with the error appended to `notes` (never `issues`) and is retried successfully on the next run, an empty source folder makes no network call at all, and a network error on one candidate doesn't stop the next candidate in the batch from still committing successfully |
| `lib/ingestion/__tests__/rollback.test.ts` | 6 | `rollbackEnvironment` (`@/lib/supabase/admin` mocked): no Supabase call at all when the source folder is empty; deletes `votes` → `clip_mapping` → `clips` → `tests` in that order and moves the matching candidate files back to `approved/` for `'staging'`, to `ingested_staging` (not `approved/`) for `'production'`; `--dry-run`-equivalent resolves matching tests but deletes/moves nothing; a mid-batch delete failure throws with the real error message and leaves every candidate file unmoved; a candidate whose `source_ref` no longer resolves to any real test still gets its local file moved back (nothing left to delete server-side) |
| `lib/ingestion/scrape/__tests__/parse-thread-page.test.ts` | 10 | Author/timestamp/permalink/body/links extraction from a phpBB post; ephemeral `sid` stripped from permalinks; quote block → markdown, `quoted_post_url` resolves to `null` for phpBB's default quote (no post link) and to a real URL when a quote manually links one; links inside a quote excluded from the post's own `links`; a post with no username link or no timestamp doesn't throw; multiple posts on one page extracted in order; `findNextPageUrl` via `rel="next"`, `null` on the last page |
| `lib/ingestion/scrape/__tests__/fetch-oembed.test.ts` | 6 | Successful YouTube/Vimeo oEmbed lookups populate `oembed_title`/`oembed_author`; a non-YouTube/Vimeo link is skipped with no network call; a failed/404 response or a network error is swallowed, not thrown; `enrichLinksWithOEmbed` enriches each link independently, preserving order |
| `lib/ingestion/scrape/__tests__/page-cache.test.ts` | 8 | Resumable per-page scrape cache: raw HTML and parsed+enriched JSON round-trip, keyed by page number; cache miss returns `null` rather than throwing; a non-ENOENT read error (e.g. a directory where a file is expected) still propagates; writing creates the cache directory if it doesn't exist; page numbers are zero-padded on disk |
| `lib/ingestion/extract/__tests__/source-ref.test.ts` | 8 | `buildSourceRef`: keys a normal post off its real phpBB post ID via `?p=`/`&p=`, never array position; falls back to a content-hash `unresolvable-<hash>` key (flagged `unresolvable`) when `post_url` is empty or unparseable; two different unresolvable posts get two different hashes; the same unresolvable post gets the same hash every time |
| `lib/ingestion/extract/__tests__/candidate.test.ts` | 18 | `isProtectedStatus`/`isRevealed`; candidate file storage: write/find by `source_ref` across all eight status folders, including `broken/` (plus nested `ingested/staging`/`ingested/production`); `writeCandidate` throws with no `source_ref`; `moveCandidate` moves and removes the old file, no-ops when nothing exists at the source; `deleteCandidate` deletes or no-ops; `readAllCandidates` reads every folder, empty when none exist; `listCandidatesInStatus` reads only the requested status (ignores every other folder), resolves the nested `ingested/staging`/`ingested/production` paths correctly, and returns empty for a status with no folder on disk yet |
| `lib/ingestion/extract/__tests__/candidate-index.test.ts` | 22 | `buildCandidateIndex`: accounts for every post_url across all eight folders, never an empty one; only offers a not-yet-revealed candidate as an open match, never a revealed/approved/ingested/expired/broken one even though it's still accounted for; bare-label fallback scoped per creator, including a composite label like `"1/2"` or `"1 vs 2"` (found necessary against real data — decision 15's trial run); open-vs-all candidates-for-creator and `getAllOpenCandidates` span every creator; `saveCandidate` creates, moves (updating the index and dropping stale open-map entries), and refuses to move a candidate out of a protected status; `sweepExpiredCandidates` expires an open candidate past 21 days measured from its own `created_at`, never one within the window, already revealed, missing `created_at`, or already protected; `isReplyToBrokenCandidate` is true only when the quoted post belongs to a candidate whose current status is `broken`, false for any other status and for an unaccounted-for post_url |
| `lib/ingestion/extract/__tests__/clip-health.test.ts` | 12 | `isRealPostLink`: false for empty/whitespace or a URL not among the post's own real links, true when it is (catches a model-hallucinated clip URL — decision 15's trial run finding); `checkClipHealth`: trusts youtube/vimeo by shape with no network call, returns `'unverifiable'` for a google-drive URL with no network call (an anonymous request can't tell a dead Drive file from a healthy one — both return an identical 404, verified against real examples), `'dead'`/`'ok'`(degraded stays passable)/`'ok'`(genuine media)/`'unplayable'`(reachable non-media page, the real Dropbox/Photos/iCloud case) for a `direct` URL; `checkClipStatus`: `'missing'` with no network call for an empty or not-a-real-post-link URL, runs the real check once confirmed |
| `lib/ingestion/extract/__tests__/extract-post.test.ts` | 23 | `extractPost` (generateObject mocked): test-defining posts create a pending candidate with track identification (confident vs. placeholder + `unidentified_track`), `dead_clip_url`/`missing_clip_url`/`unplayable_clip_url` routing straight to `broken` (fatal — a human can't fix these by editing the file), `unverifiable_clip_url` routing to `needs_review` not `broken` (non-fatal — a google-drive link needs a human look, not an automatic rejection), never calling the network check for youtube/vimeo/google-drive, `missing_timestamp`, `unresolvable_post_id`, one candidate per pair for multiple independent comparison groups, and a chained 3-clip group decomposed into consecutive pairs with genuinely distinguishing `forum_labels` (not a flat, colliding `['A','B']` — the real bug decision 15's trial run found); `payload.created_at` is set from the post's own `posted_at` (and left unset, not an empty string, when the post has no resolvable timestamp); reveal posts close the matching candidate via `quoted_post_url` or creator+label fallback, moving it to `ready` once complete, and no-op with a warning when nothing matches; vote posts attach via the same two signals, replace an earlier vote from the same voter (decision 9) rather than duplicating, stay `pending` until a reveal actually arrives, and no-op with a warning when nothing matches; irrelevant posts touch no candidate at all |

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

**Placeholder-owned fixtures** (`seedPlaceholderOwnedTest` in `e2e/helpers/admin.ts`, added for
`import-provenance.spec.ts`): exercises the real `create-placeholder-author.ts`, not a duplicate,
to seed `[E2E]`-prefixed content owned by a permanent placeholder fixture author rather than the
real `E2E_TEST_USER_EMAIL` account. Because the owner differs, this content is invisible to
`global-teardown.ts`'s main sweep (which matches by that one specific user id) — the teardown has
a second pass matching by `is_placeholder` instead, so it's still cleaned up. The placeholder
identity itself is never deleted, same as the real test user account.

**Do not** assert on exact record counts when reading existing staging data — assert on structure only.

**Teardown deletion order** (no `ON DELETE CASCADE` — must respect FK constraints):
```
votes → clip_mapping → clips → tests → system_snapshots → systems → tracks
```
Reused beyond just E2E teardown: `lib/ingestion/rollback.ts` (votes →
clip_mapping → clips → tests, stopping there — see its own file for why)
and, once built, step 38's `erase_user_content` (the full order above,
minus tracks — see `build-history-ingestion.md` step 38's plan for why
tracks are never deleted by either).

---

## 6. E2E coverage

| Spec | Scenarios |
|---|---|
| `public-feed.spec.ts` | Feed loads; unauthenticated header; test card structure; `/systems` → login redirect with redirectTo; `/about` loads without a redirect; `/profile` → login redirect; `/tracks` → login redirect; anonymous visitor can play clips on a test detail page and sees a "Sign in to vote" prompt instead of the vote form; `/register` shows the Google sign-up option alongside the email form |
| `auth.spec.ts` | Authenticated nav links (Tests / Systems / Tracks / Profile); redirectTo preserved through login flow |
| `systems.spec.ts` | Create system; edit name and description; add snapshot; edit snapshot label; systems list shows test user's systems |
| `test-creation.spec.ts` | Track search; full wizard (select track → snapshots → verify clips → publish) |
| `voting.spec.ts` | Tally hidden before voting; vote count visible; system/snapshot info visible unconditionally before any reveal (step 40 Part A); cast vote; update existing vote; creator can reveal |
| `delete.spec.ts` | Creator deletes a zero-vote test (redirects home); Delete hidden once a vote exists; owner deletes an unreferenced snapshot; Delete hidden when a test references the snapshot; owner deletes a snapshot-less system (redirects to systems list); Delete hidden when the system has a snapshot |
| `clip-health.spec.ts` | Dead clip shows a warning and player still renders; vote form replaced with an explanatory message; creator replaces a dead clip's URL, clearing the warning; "Broken" badge shown on the track and system detail pages; unsupported-playback clip shows a bare link in blind view with no "could not be identified" message; once revealed, its Before/After label in the mapping badge links directly to it with no separate link below |
| `profile.spec.ts` | Profile page loads; update display name; save disabled when name cleared |
| `import-provenance.spec.ts` | Placeholder-owned content shows the "Imported" badge on the test detail page, feed card, and track's test row; test detail page also shows a working "view original post" link (`target="_blank"`) and the claim-contact text; system detail page shows the badge and claim-contact text; an ordinarily-owned test shows none of this |
| `zz-sign-out.spec.ts` | Sign out clears the session; header reverts to unauthenticated. Runs last — see file for why |

Step 17 is complete (24/24 passing against staging). Not covered by any spec
(optional future additions, not blocking): cross-check selector flow, feed
vote-count display.

---

## 7. Integration tests

The first integration test was added in step 31 — see §11 for how it's run
and what it covers (`app/api/internal/ingest/__tests__/route.integration.test.ts`).
Unit tests mock Supabase internals; E2E tests run against the live staging
DB through a browser. Integration tests sit between them — testing an API
route against a real (staging) database, in-process, with no browser.

A second was added in step 38
(`app/api/admin/erase-user-data/__tests__/route.integration.test.ts`) —
exercises the three `erase_user_*` Postgres functions directly via
`.rpc(...)`, not the HTTP route itself (that route's own auth is
session-based, not header-based like `INGEST_SECRET`, so faking it
without a browser isn't practical the same way; its unauthenticated paths
were instead manually `curl`-verified once — see §11).

Other candidates for this tier, not yet added:
- Protected route access patterns at the API boundary, for other routes
- Form submission workflows end-to-end through API routes

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

---

## 11. Integration tests

Separate tier from both the unit suite (§1–4, mocked Supabase) and E2E
(§5–10, Playwright browser). An integration test imports a route handler
directly and calls it with a constructed `NextRequest`, hitting a real
(staging) Supabase project — no browser, no dev server needed.

**Config:** `vitest.integration.config.ts` — a separate Vitest config from
`vitest.config.ts`, `node` environment, matching only `**/*.integration.test.ts`.
That pattern is also added to the main `vitest.config.ts`'s `exclude` list,
so `npm test` never touches staging.

**Run:**
```bash
npm run test:integration
```

**Requires** (same vars `e2e/global-setup.ts` already needs, read from
`.env.local` via `process.loadEnvFile`, mirroring `playwright.config.ts`):
```bash
NEXT_PUBLIC_SUPABASE_URL=<staging project URL>
SUPABASE_SERVICE_ROLE_KEY=<staging service role key>
```
`INGEST_SECRET` does **not** need to match anything already configured —
the test sets `process.env.INGEST_SECRET` itself before calling the
handler in-process.

**Data hygiene:** every track/system/test title created is prefixed
`[E2E]` and deleted in `afterAll`, in the FK-safe order §5 documents
(votes → clip_mapping → clips → tests → system_snapshots → systems →
tracks). Cleanup checks each delete's `error` and throws rather than
swallowing it — an earlier version of this test silently ignored a
foreign-key error there and leaked a track/system pair into staging
undetected. The placeholder authors/voters it resolves are **not**
deleted — four fixed usernames (`e2e-ingest-author-1/2`,
`e2e-ingest-voter-1/2`) are a permanent fixture, the same pattern as
`E2E_TEST_USER_EMAIL` (§5 rule 1): re-running the file resolves them via
their existing `import_authors` mapping instead of creating duplicates.

**Coverage** (`app/api/internal/ingest/__tests__/route.integration.test.ts`,
9 tests): creates a test and resolves the post author plus two distinct
voter placeholders, recording both votes; a duplicate vote from the same
voter on the same technique is silently skipped rather than erroring the
whole import; a repeat call with the same `source_ref` is a no-op
(`alreadyImported: true`, same test id); a payload naming an existing
system under the same author reuses it rather than duplicating; two
different authors naming the same system each get their own system row;
`status`/`revealed_at` are set to `'revealed'`/non-null when the payload
carries at least one vote and left `'open'`/`null` when it has none
(build-history-ingestion.md step 36 finding 8); an explicit `created_at`
in the payload becomes the real `tests.created_at`, and omitting it still
falls back to ingestion time exactly as before; the created test's title
follows `resolveTestTitle`'s new "system · artist – title" fallback
format (build-history.md step 40 Part B); a request with the wrong
`x-ingest-secret` is rejected with 403.

**Coverage** (`app/api/admin/erase-user-data/__tests__/route.integration.test.ts`,
5 tests, step 38): calls the three `erase_user_*` functions directly via
`.rpc(...)` rather than importing the route handler (see §7 for why) —
`erase_user_votes` deletes exactly the target's votes on a test, leaving
a different user's vote on the same test untouched; `erase_user_content`
deletes the target's test and system fully, including a vote cast by a
*different* user on that test (the test is gone, its votes can't survive
it, regardless of whose they were), while the track it used survives
untouched (never deleted, per decision 3); `erase_user_account` nulls
`tracks.created_by` for a disposable real (non-placeholder) test user's
own track, deletes their `public.users` row, and confirms
`admin.auth.admin.deleteUser()` still succeeds afterward against the
now-orphaned auth identity; `erase_user_votes`/`erase_user_content` leave
`import_authors` and the placeholder's own account untouched (decision
5); all three functions reject an anon-key caller (EXECUTE lockdown).
Requires `supabase/migrations/20260709133200_data_erasure_requests.sql`
to be applied first — applied to staging, confirmed via
`supabase migration list` and 14/14 passing for real (production not
yet — separate step).
