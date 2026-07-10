---
name: audiophile-compare-build-history-43
description: Build step 43 — Hide system/component identity on blind tests.
---

# ✅ 43 — Hide system/component identity on blind tests

**The gap this closes:** step 40 deliberately made which systems/snapshots
are being compared visible *unconditionally*, reasoning that naming the two
snapshots doesn't disclose which is "before"/"after" or which one people
preferred. That reasoning is reversed here: for a **blind** (not-yet-revealed)
test, a listener must not be able to tell which systems/components are under
comparison at all — only the recording and the two anonymous clips. Once a
test is `revealed`, showing system identity is unchanged (still fine, for
anyone). Investigation found three independent leak sites, not just the one
step 40 touched:

1. The "snapshot line" (`formatSnapshotLine` → "SystemX · Before  vs
   SystemX · After") — shown unconditionally on the feed and the test detail
   page.
2. **Ingested test titles** — step 40 Part B baked the system name directly
   into `tests.title` at ingest time, rendered unconditionally in 4 places
   (feed card, detail page, track page, system page).
3. **`app/systems/[id]/page.tsx`** — listed every test (any status) using
   any snapshot of the system being viewed, to *any logged-in user*, not
   just the owner — a wider audience than the other two leak sites.

**Decisions:**

1. **New gate: `canSeeSystemInfo = isRevealed || isCreator`.** Deliberately
   *not* `|| hasVoted` — stricter than `canSeeTally`. A voter who hasn't yet
   had the test revealed still shouldn't learn which systems were compared
   just because they voted. Mirrors the codebase's own established pattern
   (`api-conventions.md` Rule 1 `canSeeMapping`, Rule 2 `canSeeTally`) —
   computed application-side, never via RLS (`clips`/`tests` SELECT RLS is
   `using (true)`, fully public read).

2. **Three different mechanisms per surface, chosen for each one's query
   shape, not forced to one:**
   - `app/tests/[id]/page.tsx` (single row) — post-fetch redaction: null out
     the normalized snapshot values before calling `formatSnapshotLine`.
   - `app/page.tsx` + `FeedCard.tsx` (list, mixed reveal status, one query)
     — per-row post-fetch redaction, since a single feed query can't
     conditionally omit a join per row, and every row's title/badge/vote
     count must still render regardless of entitlement — only the snapshot
     sub-field is sensitive.
   - `app/systems/[id]/page.tsx` (whole test rows grouped per snapshot) —
     query-level `.or()` filter (`status.eq.revealed,creator_id.eq.<uuid>`),
     since whole rows are excluded here, not a sub-field, so filtering at
     the query avoids fetching track/clip data for a row that will never
     render.

3. **`resolveTestTitle`'s fallback reverts to the pre-step-40-Part-B format:
   `"<artist> – <title>"`.** Drops the system-name prefix (and the
   differing-systems `/`-join branch) entirely — there's no reliable way to
   disclose the system name only once revealed, since the title is fixed
   once at ingest time. Only affects the ingestion fallback branch; the web
   wizard always supplies an explicit title and never reaches it. Accepted
   trade-off: two blind tests of the same track are indistinguishable in
   list views until revealed (previously step 40 Part B's whole reason for
   existing).

4. **Stored-data format change, not retroactive.** Only affects `tests.title`
   for tests ingested after this ships. **Checked, not assumed:** queried
   staging directly (`title like '%·%' and status != 'revealed'`) — **14
   real rows** still carry the leaking format there today (e.g. `"Sopper's
   system · Sarah McLachlan – Angel"`, `status: 'open'`). Production wasn't
   checked (no `SUPABASE_URL_PRODUCTION`/`SUPABASE_SERVICE_ROLE_KEY_PRODUCTION`
   available locally — deliberately absent per the rollback-script safety
   convention in `docs/vercel-setup.md`). **Decision: leave existing rows
   as-is, no backfill script.** These 14 known staging rows (and whatever
   matching rows exist on production) keep the old title format, leaking
   system identity, until each is individually revealed.

**Files updated:**
- `app/tests/[id]/page.tsx` — `canSeeSystemInfo` computed alongside the
  existing `isCreator`/`isRevealed`; `snapshotA`/`snapshotB` null unless
  entitled.
- `app/page.tsx` — added `creator_id` to the feed query's select (previously
  only the `creator` join was selected); per-row `canSeeSystemInfo` computed
  in the `tests.map(...)` block, redacting `snapshot_a`/`snapshot_b` before
  building `feedTests`. `components/feed/FeedCard.tsx` needed no change —
  it already renders the snapshot line conditionally and
  `formatSnapshotLine(null, null)` already returns `''`.
- `app/systems/[id]/page.tsx` — second `.or()` ANDed onto the existing
  snapshot-id filter on the tests query.
- `lib/tests/format-snapshot-line.ts` — header comment updated; no
  functional change, the helper has no visibility opinion of its own.
- `lib/ingestion/ingest-test-payload.ts` — `resolveTestTitle` reverted per
  decision 3.
- `lib/ingestion/__tests__/ingest-test-payload.test.ts` — two fallback cases
  updated to the reverted format; the differing-system-names `/`-join case
  deleted (nothing left to test, the format no longer varies by system
  name).
- `app/api/internal/ingest/__tests__/route.integration.test.ts` — title
  assertion updated to match; fixed a stale `build-history.md` filename
  reference in the same comment (pre-existing staleness from an earlier
  session's file split, unrelated to this step but touched anyway since the
  line was already being edited).
- Docs: `components.md` §8 (documents `canSeeSystemInfo` and the three
  mechanisms), `testing.md` (unit/E2E inventory rows), `api-conventions.md`
  (new Rule 9), `entry.md` (new Key Invariants bullet, step count bumped to
  43).

**Tests:**
- `lib/ingestion/__tests__/ingest-test-payload.test.ts` — updated in place,
  net −1 case.
- `e2e/tests/voting.spec.ts` — the pre-existing "before voting" test renamed
  to make explicit it was only ever testing the creator's own entitlement
  (`seedCompleteTest`'s `creatorId` defaults to the same account Playwright
  authenticates as); new test added for the non-creator case (logged-out
  context, the closest available stand-in — the harness has only one real
  E2E identity, and `canSeeSystemInfo`'s `isCreator` check doesn't
  distinguish anonymous from a different authenticated user either way);
  new test added confirming a non-creator sees the info once revealed.
- **A real, pre-existing bug found and fixed while building the new "after
  reveal" test, not by inspection:** the existing "creator can reveal the
  test" assertion (`page.getByText(revealedStatus).or(page.getByText(mapping.before))`)
  could pass as a false positive — `ConfirmButton.tsx`'s own
  `confirmWarning` copy ("...will see the result **before** they vote")
  contains the word "before", which case-insensitively matches
  `mapping.before`'s "Before" locator, and stays mounted for the entire
  confirming/pending duration regardless of whether the reveal API call
  actually completed. Nothing before this step ever depended on the reveal
  having *genuinely* finished by the time the test ended, so this was never
  caught. Fixed: wait for the reveal button itself to disappear (a real
  server-round-trip signal) instead. Caught only because the new "after
  reveal" test is the first thing in this codebase to build on "the
  previous test's reveal really completed" as an actual precondition.
- **`app/systems/[id]/page.tsx` non-creator case has no automated E2E
  coverage.** `/systems/[id]` is behind `middleware.ts`'s protected-paths
  list, so the logged-out proxy used in `voting.spec.ts` doesn't work here
  (redirects to `/login` before reaching the page) — this needs a second
  authenticated identity that isn't the test's creator, which doesn't exist
  in the harness (only one `E2E_TEST_USER_EMAIL` account). Not built in
  this step; flagged as a known gap, same proportionality precedent as
  steps 38/39's admin positive-case-only testing. The owner-sees-own-blind-test
  case is covered by the unmodified `systems.spec.ts` continuing to pass.

**Verified:**
- `npm run test` — 38 files / 439 tests, all passing (net −1 vs. step 42's
  440, per the deleted test case above).
- `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step).
- `npm run test:integration` — 17/17 passing against real staging,
  including the updated title assertion.
- `npx playwright test e2e/tests/voting.spec.ts e2e/tests/systems.spec.ts
  e2e/tests/import-provenance.spec.ts e2e/tests/delete.spec.ts
  e2e/tests/clip-health.spec.ts` — run against a local dev server
  (`E2E_BASE_URL=http://localhost:3000`, pointed at the same staging
  Supabase project via the ambient `.env.local` credentials) — 28/28
  passing. First run without the `E2E_BASE_URL` override correctly failed
  (staging is still running the previously-deployed code, same
  deployment-staleness reason steps 23/26/27/40 all ran e2e locally
  instead) — re-run locally confirmed the real fix, not assumed from the
  first run's failure.
