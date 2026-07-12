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

## 4. Unit test inventory (47 files · 511 tests · all passing)

| File | Tests | What it covers |
|---|---|---|
| `__tests__/setup.test.ts` | 3 | Test infrastructure verification |
| `__tests__/LoginForm.test.tsx` | 12 | Email input, success/error states, Supabase OTP call, redirectTo |
| `__tests__/OAuthButtons.test.tsx` | 5 | Google button, signInWithOAuth call, redirectTo prop |
| `__tests__/supabase-client.test.ts` | 7 | Browser client creation, env vars |
| `__tests__/supabase-server.test.ts` | 10 | Async client, cookie handling, env vars |
| `components/__tests__/LoginWithPasswordForm.test.tsx` | 9 | signInWithPassword, error cases (invalid creds, unconfirmed email), redirect |
| `components/__tests__/RegisterForm.test.tsx` | 9 | signUp, validation (length, complexity — step 51, match), success state, already-registered error |
| `components/__tests__/ForgotPasswordForm.test.tsx` | 5 | resetPasswordForEmail, success message, onBack callback |
| `components/__tests__/SignOutButton.test.tsx` | 4 | signOut, window.location navigation, loading state |
| `components/__tests__/ProfileForm.test.tsx` | 13 | PATCH /api/profile, trim, validation, success/error states |
| `components/__tests__/ChangeEmailForm.test.tsx` | 4 | updateUser({ email }), confirmation message, loading state |
| `components/__tests__/ChangePasswordForm.test.tsx` | 11 | updateUser({ password }), validation (length, complexity — step 51, match), autoOpen prop, loading state |
| `components/media/__tests__/ABPlayer.test.tsx` | 4 | Renders A and B labels; hideClipA/hideClipB hide that slot entirely; a Google Drive clip renders an iframe embed with the expected preview src |
| `components/media/__tests__/MediaPlayer.test.tsx` | 5 | Dispatch logic (step 54): a direct clip with media_type unknown renders NativePlayer (a `<video>`), not a bare link; unresolved media_type defaults to `<video>` not `<audio>`; media_type audio renders `<audio>`; provider unknown still renders the bare link; uses canonical_url (not source_url) as the media element src when they differ (step 56, Dropbox) |
| `components/media/players/__tests__/NativePlayer.test.tsx` | 9 | Redesigned in step 56 to drop the load-timeout race entirely (3s then 5s both still produced occasional false fallbacks on real Dropbox clips): the fallback link is the default, shown immediately; `<audio>`/`<video>` is mounted but visually hidden until `onLoadedMetadata` confirms real media, at which point it's revealed and the link disappears; onPlay fires on the element's play event; the link simply keeps showing if the element errors, since there's no separate error state to recover from; pause() via ref doesn't throw before load; uses fallbackUrl (not url) for the link when the two differ (Dropbox's raw=1 vs its original share page); resets to showing the link again when the url prop changes |
| `components/media/players/__tests__/YouTubePlayer.test.tsx` | 4 | `playerVars.playsinline` is `1` — keeps embeds inline on iOS Safari instead of forcing native fullscreen (step 55); onStateChange with PLAYING calls onPlay; pause() via ref calls the SDK's pauseVideo(); the SDK target container carries the classes (`absolute inset-0 w-full h-full`) the IFrame API needs to size the iframe it replaces it with responsively |
| `components/media/players/__tests__/GoogleDrivePlayer.test.tsx` | 3 | Play detection via focus/blur heuristic (step 53): onPlay fires when focus moves into the iframe, doesn't fire for an unrelated window blur; pause() force-remounts the iframe (no real pause API exists) |
| `components/tests/__tests__/VoteForm.test.tsx` | 22 | Rendering, Other field visibility, validation, submission, pre-population, hasDeadClip |
| `components/tests/__tests__/StepSnapshots.test.tsx` | 28 | Open/close, validation, POST, onSnapshotCreated, inline system creation |
| `components/systems/__tests__/AddSnapshotForm.test.tsx` | 14 | Open/close, POST, router.refresh on success, validation |
| `components/systems/__tests__/CreateSystemForm.test.tsx` | 11 | POST /api/systems, validation, redirect, cancel |
| `components/systems/__tests__/EditSystemForm.test.tsx` | 12 | PATCH /api/systems/[id], validation, redirect, cancel |
| `components/systems/__tests__/SnapshotSection.test.tsx` | 27 | Display/edit mode, component rows, PATCH, router.refresh, delete confirm/cancel |
| `lib/auth/__tests__/password-rules.test.ts` | 11 | Password complexity sliding by length (step 51) — 3-of-4 character classes under 20 chars, the `'password123'` regression case, the 20-char boundary, long all-digit/all-symbol strings rejected, a long plain-lowercase passphrase accepted |
| `lib/clips/__tests__/detect-provider.test.ts` | 16 | YouTube / Vimeo / Google Drive / direct / unknown URL classification; a Drive folder link isn't misdetected as a file; Dropbox share links (step 56) rewrite dl=0/absent-dl to raw=1 preserving rlkey and other params, idempotent for an already-raw=1 URL, and handles bare dropbox.com as well as www |
| `lib/clips/__tests__/is-unsupported.test.ts` | 3 | `isUnsupportedClip` (step 54 simplification): true only for provider unknown; false for direct regardless of media_type; false for every embeddable provider |
| `lib/clips/__tests__/to-clip-data.test.ts` | 6 | embed_id and canonical_url derivation for each provider, including Google Drive |
| `lib/clips/__tests__/find-shared-clips.test.ts` | 9 | Shared track finder; side A/B selection; no shared tracks |
| `lib/votes/__tests__/compute-tally.test.ts` | 16 | Grouping, percentages, divergence detection, Other routing |
| `lib/votes/__tests__/compute-outcome.test.ts` | 8 | Win/loss/draw/no-votes/open per snapshot |
| `lib/admin/__tests__/is-admin-email.test.ts` | 7 | ADMIN_EMAILS allowlist: unset, null/undefined email, match, no match, case-insensitivity, whitespace, empty entries |
| `lib/ingestion/__tests__/create-placeholder-author.test.ts` | 8 | Slugification (lowercase/strip/collapse/trim/truncate); resolves an existing (source, external_username) mapping without recreating; creates a new placeholder author; two usernames that slugify identically still get distinct placeholders; throws on auth user creation failure |
| `lib/ingestion/__tests__/ingest-test-payload.test.ts` | 24 | `validateIngestPayload`: accepts a fully populated payload (with and without votes, and with an optional `source_url`); rejects each missing required field on the top level, on `snapshot_a`/`snapshot_b`, and on a vote entry (`voter`, `chosen_label`, `technique_name`); accepts an optional, valid `created_at` and passes it through, is fine with no `created_at` at all (web-created tests never set it), rejects an unparseable one; the optional `knownTechniques` parameter accepts a listed technique, rejects an unlisted one, and is a no-op when omitted; `resolveTestTitle`: uses an explicit title, falls back to "artist – title" when omitted or whitespace-only, never disclosing system identity (step 43 reverted step 40 Part B's system-name prefix); `TUNE_METHOD_TECHNIQUE_NAME` is pinned against the real seeded `listening_techniques` row |
| `supabase/migrations/__tests__/deactivate-non-tune-method-techniques.test.ts` | 2 | `20260712170000_deactivate_non_tune_method_techniques.sql` (step 57): deactivates every technique except Tune Method (`TUNE_METHOD_TECHNIQUE_NAME`, reused from `lib/ingestion/ingest-test-payload.ts`); doesn't touch table shape or any other table |
| `supabase/migrations/__tests__/correct-tune-method-description.test.ts` | 3 | `20260712174500_correct_tune_method_description.sql` (step 57 follow-up): updates only the Tune Method row; the new description (scoped to the `set description = '...'` clause, not the whole file, since the preceding comment legitimately quotes the old text) no longer conflates Tune Method with PRaT's rhythm/pace/timing framing; doesn't touch table shape or any other table |
| `lib/tests/__tests__/format-snapshot-line.test.ts` | 5 | `formatSnapshotLine`: joins both snapshots with their system name; falls back to `'?'` when a snapshot has no joined system; shows only one side when the other is `null`; returns an empty string when both are `null` — visibility gating (`canSeeSystemInfo`, step 43) is the caller's job, not this helper's, see `components.md §8` |
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
`seedClaimedTest` (step 44, same file) deliberately does *not* use a
placeholder at all — it seeds a normal, `E2E_TEST_USER_EMAIL`-owned test
with a `source_url` set directly, reproducing the post-claim shape without
ever creating (and thus without needing to clean up) a throwaway
placeholder/`import_authors` row; it's covered by the main sweep like any
other `seedTest` fixture.

**Do not** assert on exact record counts when reading existing staging data — assert on structure only.

**Teardown deletion order** (no `ON DELETE CASCADE` — must respect FK constraints):
```
votes → clip_mapping → clips → tests → system_snapshots → systems → tracks
```
Reused beyond just E2E teardown: `lib/ingestion/rollback.ts` (votes →
clip_mapping → clips → tests, stopping there — see its own file for why)
and, once built, step 38's `erase_user_content` (the full order above,
minus tracks — see `build-history-ingestion/38-data-erasure-requests.md` for why
tracks are never deleted by either).

**Verifying a reveal actually succeeded — a two-part check, not one
(hit twice, steps 43 and 46):** `ConfirmButton.tsx`'s confirm panel
replaces the original button (e.g. `m.tests.reveal.button`, "Reveal
before/after") the moment it's clicked, *before* the async action it
guards has resolved either way. So `await expect(revealButton).not.toBeVisible()`
alone only proves the confirm panel opened — not that the underlying
`POST /api/tests/[id]/reveal` call actually succeeded. Step 43 already
established the fix (wait for the button gone **and** for
`m.tests.revealedStatus` text to appear — a signal that only shows up
once the page has re-rendered with genuinely `isRevealed: true` server
data); step 46 copy-pasted only the first half into a new test and hit
the exact same false-positive class of bug again, confirmed via a raw
REST query showing `status: 'open'` in the database at the moment the
weaker assertion had already passed. **Always use both assertions
together** when a test's later steps depend on a reveal having really
completed — see `e2e/tests/voting.spec.ts`'s `'creator can reveal the
test'` test for the canonical two-line pattern.

---

## 6. E2E coverage

| Spec | Scenarios |
|---|---|
| `public-feed.spec.ts` | Feed loads; unauthenticated header; test card structure; `/systems` → login redirect with redirectTo; `/about` loads without a redirect; `/profile` → login redirect; `/tracks` → login redirect; anonymous visitor can play clips on a test detail page and sees a "Sign in to vote" prompt instead of the vote form; `/register` shows the Google sign-up option alongside the email form |
| `auth.spec.ts` | Authenticated nav links (Tests / Systems / Tracks / Profile); redirectTo preserved through login flow |
| `systems.spec.ts` | Create system; edit name and description; add snapshot; edit snapshot label; systems list shows test user's systems |
| `test-creation.spec.ts` | Track search; full wizard (select track → snapshots → verify clips → publish), including an optional forum discussion link visible to the creator immediately on the fresh, unrevealed, un-voted test (step 46) |
| `voting.spec.ts` | Tally hidden before voting; vote count visible; system/snapshot info visible to the test's creator before reveal but hidden from a non-creator (`canSeeSystemInfo`, step 43); cast vote (Tune Method only, step 57); update existing vote; creator can reveal; system/snapshot info visible to a non-creator too once revealed; a creator-added forum link is hidden from a non-creator until reveal and stays editable after reveal and after a vote exists (step 46) |
| `delete.spec.ts` | Creator deletes a zero-vote test (redirects home); Delete hidden once a vote exists; owner deletes an unreferenced snapshot; Delete hidden when a test references the snapshot; owner deletes a snapshot-less system (redirects to systems list); Delete hidden when the system has a snapshot |
| `clip-health.spec.ts` | Dead clip shows a warning and player still renders; vote form replaced with an explanatory message; creator replaces a dead clip's URL, clearing the warning; "Broken" badge shown on the track and system detail pages; unsupported-playback clip shows a bare link in blind view with no "could not be identified" message; once revealed, its Before/After label in the mapping badge links directly to it with no separate link below |
| `profile.spec.ts` | Profile page loads; update display name; save disabled when name cleared; non-admin user does not see the Admin section (step 41) |
| `import-provenance.spec.ts` | Placeholder-owned content shows the "Imported" badge on the test detail page, feed card, and track's test row; test detail page also shows a working "view original post" link (`target="_blank"`) and the claim-contact text; system detail page shows the badge and claim-contact text; an ordinarily-owned test shows none of this; a claimed test (step 47, `seedClaimedTest`) still shows the original-post link and the imported badge, but not the claim-contact text |
| `date-formatting.spec.ts` | Dates render using the visiting browser's locale (step 49) — a test detail page date shows `dd/mm/yyyy` under a `test.use({ locale: 'en-GB' })` context and `m/d/yyyy` under `'en-US'`, using `setTestCreatedAt` to force an unambiguous fixed date (day > 12) regardless of what day the suite runs |
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

A third was added in step 39
(`app/api/admin/claim/__tests__/route.integration.test.ts`) — same
corrected precedent as step 38's, calling `claim_placeholder` directly
via `.rpc(...)`, its route's unauthenticated paths manually `curl`-
verified separately (see §11).

Other candidates for this tier, not yet added:
- Protected route access patterns at the API boundary, for other routes
- Form submission workflows end-to-end through API routes

**`app/api/cron/check-urls/route.ts` was considered for this tier (step
58) and deliberately rejected**, despite being header-secret-authenticated
the same way `ingest`/`erase-user-data`/`claim` are: unlike those three,
whose `.rpc()` calls only touch the rows the test itself creates, this
route's query is deliberately unscoped ("regardless of test status," step
10) — it HEAD-checks *every* checkable clip in the database. Confirmed
directly: invoking it against real staging checked 103 real clips in
~65 seconds, several times over this config's 30s `testTimeout` and broad
enough to mutate every real clip's `url_status` on every
`npm run test:integration` run. Stays manually-verified instead — see
`build-history/58-google-drive-cron-health-check.md` for how it was
verified before shipping.

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
(build-history-ingestion/36-commit.md finding 8); an explicit `created_at`
in the payload becomes the real `tests.created_at`, and omitting it still
falls back to ingestion time exactly as before; the created test's title
follows `resolveTestTitle`'s new "system · artist – title" fallback
format (build-history/40-system-snapshot-info-consistency.md Part B); a request with the wrong
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

**Coverage** (`app/api/admin/claim/__tests__/route.integration.test.ts`,
3 tests, steps 39 and 45): calls `claim_placeholder` directly via
`.rpc(...)` rather than importing the route handler (same reason as step
38's, §7) — reassigns all content FK columns (systems, tests, tracks,
comments, votes, and — step 45 — `user_technique_preferences`) from a
disposable placeholder to a disposable real user, repoints (not deletes)
`import_authors` to the real user, deletes the placeholder's
`public.users` row, and confirms `admin.auth.admin.deleteUser()` still
succeeds afterward against the now-orphaned auth identity; when the real
user already voted the same `(test_id, technique_id)` the placeholder
did — or already has a preference row for the same technique — the
placeholder's colliding row is dropped and the real user's own survives
untouched, rather than the merge erroring (decision 5, and step 45's
identical collision handling for `user_technique_preferences`); rejects
an anon-key caller (EXECUTE lockdown). Requires this step's migration to
be applied first (see build-history-ingestion/39-claim-flow.md for the
exact filename and staging/production apply status once run;
`20260710082825_user_technique_preferences.sql` layers step 45's
extension on top, applied to staging).
