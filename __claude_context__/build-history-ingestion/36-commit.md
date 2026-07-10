---
name: audiophile-compare-build-history-ingestion-36
description: Forum ingestion step 36 — Commit.
---

# ✅ 36 — Commit

**The gap this closes:** approved candidates need to actually reach the
app. This is the only step in the whole pipeline that makes a real HTTP
call to a deployed environment — deliberately separated from extraction
(step 35) since it has none of extraction's uncertainty: no LLM, no
judgment calls, nothing to review.

**Decisions:**

1. **A single script, parameterized by target environment, reading a
   different source folder per environment — enforcing "staging first" at
   the tooling level, not just as a documented convention.** `scripts/
   commit-lejonklou.ts --env staging|production` (base URL resolved per
   decisions 5/6 below), using
   `CandidateStatusValue.APPROVED`/`.INGESTED_STAGING`/
   `.INGESTED_PRODUCTION` (never a raw `'approved'`/`'ingested_staging'`/
   `'ingested_production'` string literal, matching step 35's constants
   refactor):
   - `--env staging` reads every file in `approved/`, POSTs each to
     `<base-url>/api/internal/ingest`, and moves successes to
     `ingested/staging/`.
   - `--env production` reads every file in `ingested/staging/` —
     **not** `approved/`. This is the fix for an earlier version of this
     plan, which had both environments reading from `approved/`: since a
     successful commit moves a file out of its source folder, staging
     would have drained `approved/` before production ever ran. Chaining
     production's input to staging's output instead means a candidate
     physically cannot reach production without having already been
     committed to staging first — and it also means production always
     ships *exactly* the set staging verified, even if more scraping/
     extraction happens in between (new candidates land in `pending/`/
     `needs_review/`/`ready/`, never in `ingested/staging/`, so they
     can't reach production via this script no matter what).
   - On success, `--env production` moves the file to
     `ingested/production/` — the terminal state.

   **A real gap, found by checking against `candidate.ts` rather than
   assumed:** `approved` is a flat top-level folder, but
   `ingested_staging`/`ingested_production` map to the *nested*
   `ingested/staging`/`ingested/production` folders (`STATUS_FOLDERS` in
   `lib/ingestion/extract/candidate.ts`) — and that mapping is private,
   never exported. `readAllCandidates` only ever reads every folder
   together, never one status in isolation, so there is currently no way
   for a new script to correctly list "every file in `ingested/staging/`"
   without either duplicating the nested-path knowledge (risking exactly
   the mismatch `recheck-clip-health.ts` avoided only because its three
   folders — `pending`/`needs_review`/`ready` — all happen to be flat) or
   a small `candidate.ts` addition. **Resolved as part of decision 4
   below**, not deferred to build time.
2. **A non-2xx response leaves the file in its current source folder**
   (`approved/` for a staging attempt, `ingested/staging/` for a
   production attempt) via `writeCandidate` (content changes, status
   doesn't — never `moveCandidate`, and never `saveCandidate`, which
   isn't part of this walk). The real route's error body is a free-text
   message (`{ error: string }` — see `app/api/internal/ingest/
   route.ts:60,110`), not one of a fixed set of codes, so per step 35
   decision 1's typed-issues/free-text-notes split it belongs in `notes`,
   not `issues` — `issues` stays reserved for the enum `IssueCode` union.
   Retried on the next run rather than silently lost.
3. **Idempotent by construction, independent of this script's own
   bookkeeping.** Even if `commit-lejonklou.ts` is run twice for the same
   candidate and environment, `ingest_test`'s `source_ref` uniqueness
   means a repeat POST just returns `alreadyImported: true` in the JSON
   response (confirmed against the real route and `api-conventions.md`'s
   documented contract — `already_imported` is only the internal Postgres
   RPC field name, not what the HTTP response actually carries) rather
   than duplicating — moving the file is a convenience, not the safety
   mechanism.
4. **A small new `lib/ingestion/commit.ts`, not "no new library code" —
   matching the pattern every other step already established** (`extract-
   post.ts`/`extract-lejonklou.ts`, `create-placeholder-author.ts`/the
   route that calls it): real logic lives in `lib/`, `scripts/*.ts` stays
   a thin argv-parsing wrapper. None of the five existing pipeline scripts
   (`scrape-lejonklou.ts`, `extract-lejonklou.ts`,
   `resolve-candidate-track.ts`, `default-before-is-a.ts`,
   `recheck-clip-health.ts`) has its own test file — all tested logic
   lives in `lib/`, and there's no reason for this step to be the first
   exception. `lib/ingestion/commit.ts` exports:
   - `listCandidatesInStatus(baseDir, status)` — a new, single-status
     reader added to `candidate.ts` alongside the existing
     `readAllCandidates` (which reads every folder together and is wrong
     for this use), correctly resolving the nested `ingested/staging`/
     `ingested/production` paths since it shares `filePathFor`'s
     already-correct resolution instead of a second, independent
     implementation of it — this is what actually closes decision 1's
     gap above.
   - `commitCandidate(baseUrl, secret, candidate)` — POSTs one candidate
     to `/api/internal/ingest` and returns the parsed `{ testId,
     alreadyImported }` or `{ error }` shape.
   - `commitEnvironment(baseDir, baseUrl, secret, env)` — the per-
     environment loop: source/destination status pair, calls the two
     functions above, calls `writeCandidate`/`moveCandidate` for the
     success/failure paths per decision 2.
   `scripts/commit-lejonklou.ts` becomes argv parsing plus one call to
   `commitEnvironment`.
5. **`--env` is a required CLI argument with no default — the one choice
   that must never be implicit.** `tsx scripts/commit-lejonklou.ts --env
   staging`. Defaulting it would risk an accidental run against the wrong
   environment. The base URL and the ingest secret are *not* CLI
   arguments — a secret shouldn't appear in shell history or `ps` output,
   and (revised after the initial build — see decision 6) retyping the
   right URL by hand every run is itself an error opportunity a per-
   environment env var removes. `--base-url <url>` remains available as
   an explicit one-off override (e.g. a specific preview deployment)
   without touching `.env.local`, but there's no bare positional URL
   argument — only a named flag, so it can never be confused with the
   optional trailing `candidates-dir` positional argument regardless of
   argument order.
6. **Two separate local env vars per concern, one per environment — never
   a single ambient value.** `docs/vercel-setup.md` (Production-scope and
   Preview-scope tables) confirms staging and production are provisioned
   with *different* `INGEST_SECRET` values on Vercel; `.env.local` can
   only hold one value per key name, and step 37 explicitly runs staging
   then production as one continuous session — a single `INGEST_SECRET`
   name would force editing `.env.local` between the two commands, which
   is exactly the accidental-wrong-environment risk decision 5 exists to
   remove. `commit-lejonklou.ts` reads `INGEST_SECRET_STAGING`/
   `INGEST_SECRET_PRODUCTION` and, the same way, `COMMIT_BASE_URL_STAGING`/
   `COMMIT_BASE_URL_PRODUCTION` (added after the initial build, once real
   staging/production URLs — `https://staging.audiophile-compare.uk` and
   `https://audiophile-compare.uk` — existed to put somewhere), based on
   `--env` (all four can be populated in `.env.local` at once).
   `docs/vercel-setup.md`'s local-dev guidance has a section for all four
   names.
7. **No new dependencies beyond what steps 33 and 35 already
   established.** `tsx` as the runtime (step 33); the built-in global
   `fetch` for the POST (no HTTP client library); Node's built-in
   `fs/promises`, via the new `listCandidatesInStatus`, for listing a
   folder and `rename()`-ing a file into its destination on success (a
   same-filesystem rename is atomic — no separate copy-then-delete
   needed); `process.loadEnvFile()` to read `.env.local` for the two
   secret vars, the same pattern already used by `extract-lejonklou.ts`
   (step 35), `playwright.config.ts`, and `vitest.integration.config.ts`.

**Files to update:**
- `lib/ingestion/extract/candidate.ts` — new exported
  `listCandidatesInStatus(baseDir, status)` (decision 4).
- `lib/ingestion/commit.ts` (new) — decision 4's `commitCandidate`/
  `commitEnvironment`.
- `scripts/commit-lejonklou.ts` (new) — thin CLI wrapper.
- `package.json` — new `commit:lejonklou` script.
- `docs/vercel-setup.md` — add `INGEST_SECRET_STAGING`/
  `INGEST_SECRET_PRODUCTION` local-dev guidance (decision 6); the existing
  per-environment Vercel-dashboard `INGEST_SECRET` provisioning (Production/
  Preview scope tables) is unaffected — this only concerns how the two
  values reach a local `.env.local` for this script's own use.
- `api-conventions.md` — the existing "Forum ingestion pipeline" section
  (documents the route/idempotency/security contract already) gains a
  line noting `commit-lejonklou.ts` as the route's only caller and the
  staging-then-production folder-chaining safety design.
- `core.md` / `testing.md` — per the usual pattern, once built.

**Tests:**
- **Unit (`lib/ingestion/__tests__/commit.test.ts`):** given a fixture
  directory tree (temp folder, not the real `scripts/output/` path) with
  files spread across `approved/`, `ingested/staging/` (confirming the
  nested path resolves correctly — decision 1's gap), and other folders:
  `commitEnvironment(..., 'staging')` only reads files from `approved/`
  and moves successes to `ingested/staging/`, ignoring anything already
  there; `commitEnvironment(..., 'production')` only reads files from
  `ingested/staging/` (confirms it never touches `approved/`, even when
  `approved/` still has entries) and moves successes to
  `ingested/production/`; a non-2xx response leaves the file in its
  source folder via `writeCandidate`, with the error appended to `notes`
  (never `issues`) rather than silently dropped; a response with
  `alreadyImported: true` is still treated as success and still moves the
  file (decision 3 — idempotent, not an error). `fetch` is mocked — no
  real network call, no live Supabase/Vercel dependency.
  `listCandidatesInStatus` itself gets covered alongside `candidate.ts`'s
  other status-folder tests in `candidate.test.ts`, same file as
  `readAllCandidates`'s existing coverage.
- **E2E / integration:** none beyond what step 31 already has for the
  ingest route itself. `scripts/commit-lejonklou.ts` itself stays
  untested directly, matching every other CLI script in this pipeline —
  its only job is argv parsing plus one call into `lib/ingestion/
  commit.ts`.

**Verified:** `npm run test` — 36 files / 424 tests, all passing (19 new:
10 in the new `lib/ingestion/__tests__/commit.test.ts`, 3 more in
`candidate.test.ts` for `listCandidatesInStatus`). `npx tsc --noEmit` — no
new errors (same pre-existing, unrelated `__tests__/supabase-*.test.ts`
failures as every prior step). `scripts/commit-lejonklou.ts`'s own argv
validation manually exercised (no args, an invalid `--env` value, and a
valid invocation with no secret set) — all three fail with the intended
message and a non-zero exit code, confirmed by real invocation, not just
reading the code.

**A real bug found only by exercising `parseArgs` directly, after the
initial build, once `--base-url` and the two `COMMIT_BASE_URL_*` env vars
were added (decisions 5/6):** the first version computed each flag's
"consumed" argv indices as `[envIndex, envIndex + 1, baseUrlIndex,
baseUrlIndex + 1]`, filtering out only genuinely negative values before
building the exclusion set. That looks right but isn't: when `--base-url`
is absent, `baseUrlIndex` is `-1`, and `-1 + 1 = 0` — a value that passes
an `>= 0` filter exactly as validly as a real index 0 does. The practical
effect: any time the `candidates-dir` positional argument happened to sit
at index 0 (i.e. *before* `--env` on the command line, e.g. `tsx
commit-lejonklou.ts my-dir --env staging`), it was silently swallowed and
the default `scripts/output/candidates` was used instead — no error, no
warning, just a quietly wrong directory. Caught by directly testing
`parseArgs` against six real argument orderings, not by reading the code
or by the type checker (both index values are legitimately `number`).
Fixed by gating each flag's pair of indices on that flag's own found-ness
(`envIndex >= 0`/`baseUrlIndex >= 0`) before ever computing `+ 1`, not by
filtering the already-computed values afterward — re-verified against the
same six orderings, including the originally-broken
positional-before-`--env` case.

**A real bug found on the first actual run against real staging — every
one of 44 candidates failed with the useless message "commit failed —
[object Object]".** Root cause: `staging.audiophile-compare.uk` sits
behind Vercel Deployment Protection (SSO), the same protection
`playwright.config.ts`/`e2e/helpers/auth.ts` already work around for the
E2E suite via an `x-vercel-protection-bypass` header — but
`commitCandidate`'s `fetch` call never sent it. Every request was
intercepted by Vercel's protection layer before ever reaching
`/api/internal/ingest`, and Vercel's own challenge response has a truthy
but non-string `error` field, which the original `body.error ?? ...`
logic passed straight through into a template literal, silently
stringifying to `"[object Object]"` instead of anything actionable.
Three fixes together, not just the one-line header:
1. `commitCandidate` now sends `x-vercel-protection-bypass:
   ${VERCEL_AUTOMATION_BYPASS_SECRET}` whenever that env var is set
   (already present in `.env.local` for E2E) — the actual fix for this
   failure.
2. A new `extractErrorMessage` helper never trusts `body.error` is a
   string just because the field exists — stringifies a non-string error
   value instead of silently producing `"[object Object]"` again the next
   time something unexpected returns a differently-shaped error body.
3. `commitCandidate` no longer lets `response.json()` (or `fetch` itself)
   throw uncaught — wrapped in try/catch, returning `{ error }` like any
   other failure mode. The original version didn't do this, which meant
   the *entire batch* of 44 candidates would have aborted after the
   first one if the protection response hadn't happened to be valid
   JSON — found by inspection while fixing (1)/(2), not by another real
   failure, but a real robustness gap regardless: one candidate's bad
   response should never take down every other candidate's chance to
   commit.

Six new tests cover all three (non-string error stringified, not
`"[object Object]"`; bypass header sent only when the env var is set;
`fetch` rejection and a JSON-parse failure both become `{ error }` results
without throwing; a `commitEnvironment`-level test confirms one candidate's
network error doesn't stop the next candidate from still committing
successfully) — `lib/ingestion/__tests__/commit.test.ts` is now 16 tests
(was 10).

Re-run against real staging with the fix applied: all 44 candidates
committed successfully (`approved/` emptied, all 44 moved to
`ingested/staging/`). Confirms the bypass-header fix was the actual root
cause — see finding 8 below for what a subsequent manual review of that
real committed data turned up.

**Finding 8 — three real bugs and one real gap found by manually
reviewing the 44 real committed tests on staging, not by any test or
review pass:**
1. Every imported test was inserted `status='open'`, never `'revealed'`,
   regardless of vote count — `ingest_test` hardcoded the literal. Since
   `tests.status === 'revealed'` is what actually gates the before/after
   mapping and vote tally being visible (`app/tests/[id]/page.tsx:44`)
   *and* what blocks new voting (`app/api/votes/route.ts:47-50`, 409
   "Cannot vote on a revealed test"), every one of the 44 historical tests
   was silently open to a live visitor casting a fresh vote on a
   years-old forum clip — not just a display bug.
2. `tests.created_at` always defaulted to `now()` — the real forum post
   date already existed as `Candidate.created_at` locally but was never
   included in `candidate.payload`, so it never reached the payload
   `IngestPayload` had no field for in the first place.
3. The public feed's apparent "wrong order" turned out not to be a
   second bug: `app/page.tsx:37` already does
   `.order('created_at', { ascending: false })` correctly. Once every
   imported test's `created_at` was "now" (bug 2), all 44 shared
   near-identical timestamps and sorted effectively at random relative to
   each other — fixing bug 2 fixes this for free, confirmed by re-running
   the full delete-and-recommit cycle described below rather than assumed.
4. Pagination (`app/page.tsx`) never had First/Last links, only
   Previous/Next — a real gap, not a regression, straightforward to add.
   Not itself forum-ingestion-specific, but documented here since that's
   where it was found; no automated test exists for it (no E2E fixture
   with >20 seeded tests exists yet to exercise pagination at all).

Fixed: a new migration
(`20260709110700_ingest_test_reveal_and_date.sql`) makes `ingest_test`
compute `status`/`revealed_at` from whether the payload's `votes` array is
non-empty (revealed with `revealed_at = now()` if so, `'open'` otherwise —
the real forum reveal date isn't separately tracked, only the
test-defining post's own date is) and accept an optional `created_at`,
falling back to `now()` exactly as before when absent (so a web-created
test, which never sets it, is unaffected). `IngestPayload` gained an
optional `created_at` field; `applyTestDefining` (`extract-post.ts`) now
populates it from `candidate.created_at`, guarding against the empty
string the `missing_timestamp` path can leave there (would otherwise fail
`validateIngestPayload`'s new "must be a valid date string" check).
`app/page.tsx` gained First/Last links (new `firstPage`/`lastPage` keys in
`messages/en.json`, alongside the existing `previousPage`/`nextPage`).

Decided (rather than assumed) to fix `ingest_test` once and
delete-and-recommit the 44 existing tests, instead of also writing a
separate retroactive `UPDATE` for the already-committed rows — one code
fix covers both bugs 1 and 2 at once via a fresh commit, since deletion
was needed anyway (see step 38 below, built ahead of its formal turn to
make that recommit cycle possible).

**Finding 9 — the delete-and-recommit cycle above still didn't fix either
bug on the first attempt, for two different real reasons, both found by
the same human re-reviewing the recommitted data:**

1. **A self-inflicted regression: `source_url` disappeared from the test
   detail page entirely — and the first attempt at fixing it broke `db
   push` too.** Finding 8's migration
   (`20260709110700_ingest_test_reveal_and_date.sql`) was written by
   copying the function body straight from
   `20260707150400_ingest_test_function.sql` — the *original*
   `ingest_test`, not realizing a later migration,
   `20260707173905_tests_source_url.sql` (step 32), had already layered
   `source_url` support on top of it. `create or replace function`
   replaces the whole body, so finding 8's migration silently deleted
   `source_url` handling the moment it was applied. First fix attempt
   edited `20260709110700` in place to add `v_source_url`/`source_url`
   back — which did nothing on the next `supabase db push`, since that
   migration's version was already recorded as applied on staging
   (confirmed via `supabase migration list`: `20260709110700` shown as
   both `local` and `remote`) — `db push` only applies versions the
   remote doesn't already have, it never diffs or re-runs one it thinks
   already succeeded, so a local-only content edit after the fact is
   invisible to it. Actually fixed by reverting `20260709110700` back to
   exactly what was really applied (so the file matches staging's real
   history) and adding a new migration,
   `20260709114200_ingest_test_restore_source_url.sql`, with the
   corrected function body — the general lesson, not just this one
   instance: **never edit a migration file once its version might already
   be applied anywhere; always add a new one, and check with `supabase
   migration list` first if genuinely unsure.**
2. **The `created_at` fix genuinely worked in the code, but had nothing
   real to work with yet.** All 44 real candidate JSON files on disk were
   extracted *before* today's `extract-post.ts` change that populates
   `payload.created_at` — that fix only affects a candidate built by a
   *future* extraction run, not files already sitting in
   `ingested/staging/` from a run months ago. So every one of the 44
   recommitted payloads still had no `created_at` at all, and
   `ingest_test` correctly (and silently) fell back to `now()` exactly as
   designed — not a bug in the fix itself, but a real gap in what
   "fixing extraction" actually covers. Confirmed directly (not assumed):
   `0 of 44` `ingested/staging/*.json` files had `payload.created_at`
   before a fix, checked with a one-off script rather than by inspecting
   the files by hand. Fixed with a new one-off
   `scripts/backfill-payload-created-at.ts`, setting
   `payload.created_at = created_at` (the field extraction has *always*
   populated, just never plumbed into `payload`) for any candidate
   missing it, across every status folder — run for real, backfilling
   208 candidates repo-wide, all 44 of the currently-`ingested/staging`
   ones among them.

Both require a second rollback-and-recommit cycle to actually reach
staging — the code and data fixes above only take effect on the *next*
commit, not retroactively on rows already written under the old
(regressed or under-populated) behavior. Applying
`20260709114200_ingest_test_restore_source_url.sql` (via `supabase db
push`, which will now pick it up as a genuinely new, unapplied version)
is a prerequisite for that recommit — without it, staging is still
running the version with `source_url` missing.

---
