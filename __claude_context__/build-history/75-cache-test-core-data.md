---
name: audiophile-compare-build-history-75
description: Build step 75 — Cache the non-personalized parts of a revealed test's data (test row, track, clips, mapping) via unstable_cache.
---

# ✅ 75 — Cache the non-personalized parts of a test-detail page

**The problem:** the test-detail page's remaining challenge (raised
directly) is rendering iframes to third-party media services — but a
secondary, independent lever exists first: the main `tests` row query
(+ track, clips, snapshots) is identical for every viewer of a given
test, yet was re-fetched from Postgres on every single request. Popular
tests pay that cost repeatedly for data that never changes between
visitors.

**Why it's safe to cache:** nothing in the main query filters by
`user.id`. The per-viewer redaction (`canSeeSystemInfo`, forum-link
visibility) already happens in JS *after* the fetch, in
`app/tests/[id]/page.tsx` — not by varying the query itself. Caching the
underlying data changes nothing about who's authorized to see what; that
decision still runs fresh on every request against the cached data.

**Approach decided during planning:** Next.js 16's `'use cache'`
directive requires enabling `cacheComponents: true`, which changes the
rendering model for the *entire app* — every other route (feed, systems,
tracks, profile, admin, auth) would need auditing for the new, stricter
Suspense-boundary rules, not just this one page. Chose the narrower,
lower-risk `unstable_cache` instead: no global config flag, zero blast
radius on any other route. Still functional in this Next.js version
despite being the API `'use cache'` will eventually replace.

**New file — `lib/tests/get-cached-test-core.ts`:**
- `fetchTestCore(testId)` / `fetchRevealedMapping(testId)` — the actual
  Supabase queries, plain and exported.
- `getCachedTestCore(testId)` / `getCachedRevealedMapping(testId)` — the
  same, wrapped in `unstable_cache`, tagged `test-${testId}`,
  `revalidate: 3600`.
- Both use `lib/supabase/client.ts`'s anon-key client, not
  `lib/supabase/server.ts` — `unstable_cache` forbids dynamic APIs
  (`cookies()`/`headers()`) inside the cached function, and the server
  client calls `cookies()` internally. Not a limitation here: every table
  involved is RLS public-read (or effectively so for `clip_mapping` —
  its own RLS, "revealed OR creator_id = auth.uid()", means a
  session-less anon read naturally returns nothing for a still-open
  test, so the cached mapping fetch never needs its own `isRevealed`
  check).
- See `audiophile-compare-schema.md`'s new "Server-side caching" section
  for the full invalidation-route table.

**`app/tests/[id]/page.tsx` changes:** the main query is now
`getCachedTestCore(id)`. The `clip_mapping` branch in the existing
`Promise.all` batch (step 69) prefers the cached path whenever
`isRevealed` (regardless of `isCreator`), falling back to the original
dynamic, cookie-based fetch only for the still-open creator case —
genuinely personalized, not cacheable. Everything else (vote count,
tally, techniques, existing votes, `getRequestUser()`) is unchanged.

**Real finding during implementation — `revalidateTag`'s signature
changed:** this Next.js version requires a second, non-optional `profile`
argument: `revalidateTag(tag, profile)`. A named string profile must be
registered under `cacheLife` in `next.config` (or be the literal `"max"`)
— this codebase doesn't configure any (deliberately, per the
`unstable_cache`-over-`'use cache'` decision above), so passing an
arbitrary string throws `Invalid profile provided "..." must be
configured under cacheLife in next.config or be "max"`. Fixed by passing
`{ expire: 0 }` (a plain `CacheLifeConfig` object) instead of a string —
this bypasses the named-profile lookup entirely and forces immediate
expiration, which is exactly what an on-mutation invalidation needs.
Added to all 5 mutation routes listed in `audiophile-compare-schema.md`.

**Second real finding — `unstable_cache` can't be unit-tested at all:**
confirmed directly (a throwaway Vitest run) that calling an
`unstable_cache`-wrapped function outside a real Next.js request throws
`Invariant: incrementalCache missing` — the same class of limitation as
`lib/supabase/server.ts`. This ruled out the originally-planned
integration test (`vitest.integration.config.ts` runs in plain Node too,
no real Next.js server, so it would hit the identical invariant). Fixed
by extracting the plain query logic (`fetchTestCore`/
`fetchRevealedMapping`) out of the `unstable_cache` wrapper — those
*are* unit-testable (mocking `lib/supabase/client.ts`), and that's where
the actual query-shape/gating logic lives; only the thin caching wrapper
itself is untested by Vitest, verified instead against a real running
dev server (see Verified below).

**Files updated:**
- `lib/tests/get-cached-test-core.ts` (**new**).
- `app/tests/[id]/page.tsx` — main query + `clip_mapping` branch, as above.
- `app/api/tests/[id]/reveal/route.ts`, `app/api/tests/[id]/route.ts`
  (PATCH + DELETE), `app/api/clips/[id]/route.ts`,
  `app/api/admin/clips/[id]/override/route.ts` (also needed to start
  selecting `test_id` alongside `id`, to know which tag to invalidate) —
  `revalidateTag` added to each.
- Docs: `audiophile-compare-schema.md` (new "Server-side caching"
  section), `components.md §16` (pointer note), this file,
  `build-history/index.md`, `core.md` (§6 bump).

**Tests:**
- `lib/tests/__tests__/get-cached-test-core.test.ts` (new, 5 tests) —
  `fetchTestCore`/`fetchRevealedMapping` against a mocked Supabase chain:
  happy path, query error, no-error-no-data.
- No unit or integration test for the `unstable_cache`-wrapped functions
  themselves — genuinely can't run outside a real Next.js server (see
  finding above). Verified directly against a real dev server instead
  (see Verified below) and via the existing e2e suite, which exercises
  `app/tests/[id]/page.tsx` end-to-end regardless of which layer serves
  its data.

**Verified:**
- `npx tsc --noEmit` — no new errors.
- `npm test` — 58 files / 576 tests, all passing.
- Against a real dev server: cold request ~507ms, three repeat requests
  ~100-130ms each — a real, substantial cache-hit speedup.
- Cache invalidation, verified end-to-end with a real Playwright script
  (not just curl): seeded a fresh test, confirmed an anonymous viewer
  sees "Blind test", had the real creator session reveal it via the
  actual `POST /api/tests/[id]/reveal` route, then confirmed a *new*
  anonymous context immediately sees "Revealed" — proving
  `revalidateTag`'s `{ expire: 0 }` invalidation takes effect right away,
  not just eventually once the 1-hour `revalidate` window naturally
  lapses.
- Full local e2e suite (`E2E_BASE_URL=http://localhost:3000`) — see
  command in the Rollout section below.

**Repeat performance analysis:** pending deploy to staging — repeat
`curl -w "%{time_total}"` timing for the same test id, compared against
the pre-step-75 baseline.
