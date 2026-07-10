---
name: audiophile-compare-build-history-40
description: Build step 40 — Surface system/snapshot info consistently: test detail page + ingested test titles.
---

# ✅ 40 — Surface system/snapshot info consistently: test detail page + ingested test titles

## Part A — Show system/snapshot info on the test detail page

**The gap this closes:** the public feed (`components/feed/FeedCard.tsx`)
already shows a neutral "`SystemName · label`  vs  `SystemName · label`"
line for every test, blind or revealed — but the test detail page
(`app/tests/[id]/page.tsx`) never fetches or renders this at all. Not a
regression: confirmed via `git log` that `MappingBadge.tsx` (the
component that shows the revealed Before/After badge) has looked this way
since the page's original commit, and the detail page's own query has
never selected `snapshot_a`/`snapshot_b`. It simply went unnoticed until
now — a web-created test's own creator already knows their own system,
and no real *imported* test had ever actually reached `status='revealed'`
until the forum-ingestion pipeline's recent reveal-status fix
(`build-history-ingestion/36-commit.md` finding 8), so this is the first
time anyone besides a test's own creator has had reason to look at a
revealed test's detail page expecting to see which systems were compared.
Like step 32, this is UI work, not ingestion-pipeline infrastructure, so
it gets its full detail directly here.

**Decisions:**

1. **Match the feed's existing line exactly, not a redesign — extract a
   shared formatter instead of writing the join/format logic a second
   time.** `app/page.tsx`'s query already does
   `snapshot_a:system_snapshots!snapshot_a_id(label, system:systems(name))`
   / same for `snapshot_b`, and `FeedCard.tsx` formats it as
   `` `${system?.name ?? '?'} · ${label}` `` for each side, joined by
   `'  vs  '`, skipping either side if the join comes back null. New
   `lib/tests/format-snapshot-line.ts` exports that formatting function
   once; `FeedCard.tsx` is refactored to call it (pure refactor, no
   behavior change) and `app/tests/[id]/page.tsx` calls the same function
   against a newly-extended query. One implementation, two call sites —
   consistent with this repo's own repeated-logic convention.

2. **Shown unconditionally, not gated behind `isRevealed`.** The feed
   already shows this for both open and revealed tests today, since
   naming which two snapshots are being compared doesn't disclose which
   one is "before" vs "after," or which one people preferred — that
   information stays exactly as gated as it already is, behind
   `isRevealed`/`canSeeTally`/`MappingBadge`. The detail page's version
   must match that, not introduce a new gate the feed doesn't have.

3. **Position: directly under the track line in the header**, the same
   relative location `FeedCard` already puts it (title → track → snapshot
   line → byline), so a viewer sees consistent information in a
   consistent place whether they're looking at the feed or a test they've
   clicked into.

4. **Deliberately out of scope: `MappingBadge` itself still only shows
   generic "Before"/"After," not the actual snapshot/system name next to
   each.** E.g. "Before: Living room rig · v1 baseline" instead of just
   "Before" is a reasonable, related enhancement, but it's a separate
   design decision — it changes what a *revealed* view specifically
   discloses (right now, deliberately, just before/after identity), not
   just adds already-public information that's missing elsewhere. Noted
   as a follow-on option, not built as part of closing this gap.

**Files updated:**
- `lib/tests/format-snapshot-line.ts` (new) — `formatSnapshotLine(snapshotA,
  snapshotB)`, typed against a shared `SnapshotSummary = { label: string;
  system: { name: string } | null } | null`, extracted verbatim from
  `FeedCard.tsx`'s existing inline logic.
- `lib/tests/__tests__/format-snapshot-line.test.ts` (new) — both
  snapshots present; one or both null (test still has *a* track/clips but
  a malformed/partial snapshot join, matching `FeedCard`'s existing
  defensive handling); a system join that resolves to `null` falls back
  to `'?'`, same as today.
- `components/feed/FeedCard.tsx` — replace the inline `snapshotLine`
  construction with a call to the new shared helper. No behavior change;
  existing `FeedCard`-related tests/specs must keep passing unmodified.
- `app/tests/[id]/page.tsx` — extend the existing `.select(...)` with
  `snapshot_a:system_snapshots!snapshot_a_id(label, system:systems(name))`
  / `snapshot_b:...!snapshot_b_id(...)`; normalize the joined relation the
  same way `track`/`creator` already are (Supabase returns a singular FK
  join as either an object or a one-element array depending on PostgREST
  version); render `formatSnapshotLine(...)` in the header, unconditionally
  (decision 2).
- `__claude_context__/components.md` — document the new shared helper and
  its two call sites.
- `__claude_context__/testing.md` — new unit-test row/count; new E2E
  assertion noted against whichever spec decision below picks.

**Tests:**
- **Unit:** `format-snapshot-line.test.ts` per above. `FeedCard.tsx` has
  no dedicated unit test file today (confirmed — it's a server component,
  covered only by E2E, same convention as `app/tests/[id]/page.tsx`
  itself), so the refactor's correctness there is verified by the E2E
  assertion below, not a new unit test.
- **E2E:** extend `e2e/tests/voting.spec.ts` (already navigates to a
  seeded test's detail page via `seedCompleteTest`, which produces
  distinct, assertable fixture data — `System A {suffix}`/`Snapshot A
  {suffix}` and `System B {suffix}`/`Snapshot B {suffix}`) with an
  assertion that the detail page shows both system/snapshot names,
  visible before any reveal action — proving decision 2's "unconditional,
  not reveal-gated" requirement for real, not just by code inspection.

## Part B — Concatenate system name into ingested test titles

**The gap this closes:** an ingested test's title is currently just
`"<artist> – <title>"` (`resolveTestTitle`'s fallback,
`lib/ingestion/ingest-test-payload.ts:118-119`) — the *only* thing that
distinguishes two different comparisons of the same track (a real,
common case in this dataset — the same track gets re-compared across many
different system changes over months) is a hover or a click, since the
list/feed view shows nothing else prominent enough to tell them apart at
a glance. Prepending the system name makes each entry uniquely
identifiable without opening it.

**Confirmed scope — this only ever affects ingested tests, nothing else:**
`resolveTestTitle` has exactly one caller,
`app/api/internal/ingest/route.ts:94` — the web creation wizard's own
route (`app/api/tests/route.ts`) requires `title` as a mandatory field
directly from the form and never calls `resolveTestTitle` at all, so a
web-created test is entirely unaffected by this change; it never reaches
the fallback branch this step modifies.

**Decisions:**

1. **New format: `"<system name> · <artist> – <title>"`**, e.g.
   `"Charlie1's system · Diana Krall – The Look of Love"` — reusing the
   `·` separator this codebase already uses for the same "system name
   joined with something else" purpose (`FeedCard`'s own snapshot line,
   Part A above) rather than inventing a new one, and keeping the
   existing `–` between artist and title unchanged.
2. **Deduplicate when `snapshot_a`/`snapshot_b` share one system name
   (the real, expected case for every actual forum-ingested test —
   `extract-post.ts` always sets both snapshots' `system_name` to the
   same `"<forum author>'s system"` string) — join both names when they
   genuinely differ instead of arbitrarily picking one.** A test
   comparing snapshots from two distinctly-named systems is technically
   possible under this schema even though extraction never currently
   produces one; `resolveTestTitle` shouldn't silently drop information
   in that case. Format when different: `"<system A> / <system B> ·
   <artist> – <title>"`.
3. **An explicit `payload.title` still always wins, unchanged.** This
   only touches the fallback branch — a caller that already supplies a
   real title (none does today, but the field stays optional/available)
   is untouched.
4. **Deliberately not deduplicated against the track subtitle already
   shown separately underneath the title on the detail page** (`app/
   tests/[id]/page.tsx`'s existing `{track?.artist} — {track?.title}`
   line, Part A's new snapshot line, and now a title that also contains
   the track name) — some repetition between the H1 and its own subtitle
   is an accepted, minor cosmetic cost of making the *feed/list* view (the
   actual place this change matters — the detail page already disambiguates
   fully once opened) usefully distinct at a glance.

**Files updated:**
- `lib/ingestion/ingest-test-payload.ts` — `resolveTestTitle` rewritten
  per decisions 1-3.
- `lib/ingestion/__tests__/ingest-test-payload.test.ts` — existing
  `describe('resolveTestTitle', ...)` cases updated: the two
  fallback-path tests currently expect `"${ARTIST} – ${TRACK_TITLE}"`,
  but `validPayload()`'s fixture already gives `snapshot_a`/`snapshot_b`
  the same `SYSTEM_NAME`, so both need their expected value updated to
  `"${SYSTEM_NAME} · ${ARTIST} – ${TRACK_TITLE}"` once this ships (not a
  new bug — the fixture already matches real ingested-data shape, the
  expectation just needs to catch up to the new behavior). New case:
  `snapshot_a`/`snapshot_b` given genuinely different system names →
  both joined with `/`. Explicit-title case is unaffected, no change
  needed there.
- `app/api/internal/ingest/__tests__/route.integration.test.ts` — the
  fixture's `SYSTEM_NAME` is already shared between `snapshot_a`/
  `snapshot_b` (see its `payload()` helper), so the existing
  "creates a test" assertion's expectations may need a corresponding
  title check added, confirming the real route produces the new format
  against real staging, not just the unit-level fallback logic.
- `__claude_context__/api-conventions.md` §5 — checked: the forum-
  ingestion section doesn't currently mention `resolveTestTitle` or title
  resolution at all, so nothing to update there, only confirmed by
  reading it rather than assumed.
- `__claude_context__/testing.md` — updated test descriptions/counts for
  both files touched above.

**Tests:** covered inline in "Files updated" above — no new test files,
existing ones extended.

**Verified:** `npm run test` — 38 files / 440 tests, all passing (6 new:
5 in the new `lib/tests/__tests__/format-snapshot-line.test.ts`, 1 more in
`ingest-test-payload.test.ts` for the differing-system-names case, plus
2 existing `resolveTestTitle` fallback tests updated for the new format).
`npx tsc --noEmit` — no new errors (same pre-existing, unrelated
`__tests__/supabase-*.test.ts` failures as every prior step). `npm run
test:integration` — 9/9 passing against real staging, including the new
title-format assertion. `npx playwright test e2e/tests/voting.spec.ts` —
run twice: first against the deployed staging site
(`E2E_BASE_URL=https://staging.audiophile-compare.uk`), where the new
snapshot-line assertion correctly failed — staging is still running the
previously-deployed `page.tsx`, without Part A's query/render changes,
same reason steps 23/26/27 ran e2e locally instead. Re-run against a
local dev server (`E2E_BASE_URL=http://localhost:3000`, pointed at the
same staging Supabase project via the ambient `.env.local` credentials)
— all 4 tests passed, confirming Part A's actual rendering is correct;
the first run's failure was a deployment-staleness artifact, not a code
bug, verified by comparing the two runs directly rather than assumed.
