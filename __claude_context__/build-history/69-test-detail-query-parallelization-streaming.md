---
name: audiophile-compare-build-history-69
description: Build step 69 — Parallelize sequential Supabase queries and stream independent sections via Suspense on the test-detail and feed pages.
---

# ✅ 69 — Query parallelization + Suspense streaming for faster page loads

**The gap this closes:** investigating "why do these pages feel slow"
found `app/tests/[id]/page.tsx` awaiting up to 7-8 Supabase round trips
*sequentially* — `getUser()`, the main `tests` select, `clip_mapping`,
existing-votes, the vote-count RPC, `listening_techniques`, the tally
query, and the footer-nav id-list query — before rendering anything at
all. `toClipData()` (`lib/clips/to-clip-data.ts`) was also awaited inline
in that same chain, and for a Google Photos clip makes a real blocking
external HTTP fetch (`resolveGooglePhotosVideoUrl`,
`lib/clips/resolve-google-photos.ts`, up to a 3s timeout) that could
dominate total page time. Measured live against staging Supabase before
any change: ~280ms avg for a revealed test (worst case — every branch
exercised), ~219ms avg for a still-open one.

**Decisions:**

1. **Parallelize independent Supabase calls with `Promise.all` instead of
   sequential `await`s**, on both pages:
   - `app/tests/[id]/page.tsx`: `getUser()` + the main `tests` select run
     together (neither reads the other's result — RLS is enforced via the
     request's auth cookie, not anything passed in JS). Then
     `clip_mapping`, existing-votes, the vote-count RPC, `listening_techniques`,
     and the tally query (only when already revealed — `canSeeTally` is
     unconditionally true then) fire together in one batch. The one
     genuinely dependent case — tally on a still-open test, which needs
     `hasVoted` computed from existing-votes first — stays a separate
     awaited query afterward, since it can't be known ahead of time.
   - `app/page.tsx` (`FeedContent`): `getUser()` + the main paginated
     `tests` select run together, same reasoning. The vote-count RPC
     genuinely depends on the `testIds` from the main query's result and
     stays sequential — nothing further to parallelize there.
   Measured after this change alone (same revealed/open test ids, bare
   URL): ~174ms / ~153ms avg — roughly 30-38% faster.

2. **Split two independent, slower sections into their own async
   components under their own `<Suspense>`**, rather than awaiting them
   inline and blocking everything else on the page:
   - `TestNavFooter` — the footer prev/next/first/last nav's id-list query
     (`app/tests/[id]/page.tsx`). Previously computed inline before the
     JSX return; now a standalone async component taking `testId`, `from`,
     `fromId`, `pageParam`, `userId` as props, rendered under
     `<Suspense fallback={null}>`.
   - `ClipPlayerSection` — resolves both clips (`toClipData`) and renders
     `<ABPlayer>`. Confirmed by reading every other consumer that nothing
     else on the page needs the *resolved* `ClipData`, only the **raw**
     clip row: `effA`/`effB` (health warnings, vote gating) use
     `rawA.url_status`/`admin_override`; `hideClipA`/`hideClipB` (via
     `isUnsupportedClip`) only reads `.provider`; `VoteForm` only needs
     `rawA.id`/`rawB.id`; `MappingBadge` only needs `hideClipA`/`hideClipB`
     + snapshot data. So only the player itself needs to wait on clip
     resolution — everything else (header, badges, health warnings, tally,
     vote form) now renders and streams immediately regardless of how long
     a Google Photos fetch takes. Rendered under
     `<Suspense fallback={<ClipPlayerFallback ... />}>` — a same-shape
     ("Clip A"/"Clip B" heading + `aspect-video` box) fallback using
     `PageLoading`'s established spinner/`role="status"` convention, so
     nothing shifts once the real player mounts.

3. **RPC consolidation and full-response caching were deliberately scoped
   out.** Both would cut latency further, but are bigger, riskier changes
   (a single fat Postgres function for the former; careful interaction
   with `canSeeSystemInfo`/`hasVoted` per-viewer redaction for the latter)
   — left for a separate step if the above isn't enough.

**Files updated:**
- `app/tests/[id]/page.tsx` — `Promise.all` batching (as above); new
  `RawClip` type (shared between the main cast and `ClipPlayerSection`'s
  props); new `TestNavFooter`, `ClipPlayerSection`, `ClipPlayerFallback`,
  `ClipSlotFallback` components.
- `app/page.tsx` (`FeedContent`) — `Promise.all` batching for
  `getUser()` + the main query.
- `e2e/tests/voting.spec.ts` — new footer-nav test (closes a pre-existing
  coverage gap — no spec asserted on First/Previous/Next/Last before this).
- `e2e/tests/public-feed.spec.ts` — new throttled-connection test on the
  test-detail page, mirroring step 66's existing pattern, confirming both
  new `Suspense` boundaries actually stream and resolve under a slow
  connection.
- Docs: `components.md` (new section documenting both patterns —
  parallel-batch awaits, and splitting an independent section into its own
  `Suspense`-wrapped async component), `testing.md` (E2E coverage rows),
  this file, `build-history/index.md`, `core.md` (§6 bump).

**Tests:**
- No new unit tests — `testing.md §1` already establishes pages/async
  server components aren't unit-tested (Supabase-backed, covered by E2E
  instead); `TestNavFooter`/`ClipPlayerSection` call already-unit-tested
  functions (`getAdjacentIds`, `toClipData`) with no new logic of their own.
- `e2e/tests/voting.spec.ts`'s new footer-nav test (above).
- `e2e/tests/public-feed.spec.ts`'s new throttled-connection test (above).

**Verified:**
- `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step).
- `npm test` — 56 files / 569 tests, all passing.
- Live timing against a real dev server backed by staging Supabase
  (`curl -w "%{time_total}"`, matching bare-URL requests before/after each
  change): revealed test ~280ms → ~204ms avg (~27% faster), open test
  ~219ms → ~188ms avg (~14% faster). An intermediate measurement taken
  right after the `Promise.all` batching alone (before the
  `ClipPlayerSection` split) showed a larger gap (~174ms / ~153ms) — the
  final numbers above include some run-to-run network variance against a
  live remote DB, but the improvement is consistent and repeatable in both
  cases.
- Fetched full HTML for a revealed test with `?from=feed&page=1` and
  grepped for both streamed-in sections — footer nav labels ("First
  test"/"Previous test"/"Next test"/"Last test") and the player ("Clip
  A"/"Clip B" headings) — confirming both `Suspense` boundaries actually
  flush real content, not silently stuck on their fallback.
- Found a real Google Photos-provider clip in staging
  (`photos.app.goo.gl`) and confirmed its test detail page resolves to a
  real `<video>` element pointed at `/api/clips/google-photos-proxy`, with
  no error output — the split doesn't break that provider's playback path.
- `npx playwright test e2e/tests/voting.spec.ts e2e/tests/public-feed.spec.ts
  e2e/tests/clip-health.spec.ts` — passing, including the two new tests.
