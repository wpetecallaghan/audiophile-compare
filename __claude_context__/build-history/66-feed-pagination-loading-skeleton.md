---
name: audiophile-compare-build-history-66
description: Build step 66 — Loading skeleton for feed pagination.
---

# ✅ 66 — Loading skeleton for feed pagination

**The gap this closes:** `app/tests/[id]/page.tsx` and
`app/tracks/[id]/page.tsx` already get a loading skeleton (`<PageLoading>`,
step 60) automatically whenever a listener uses the First/Previous/Next/Last
footer nav (step 61) to move between records — Next.js shows each route's
`loading.tsx` while the new dynamic segment (`[id]`) streams in. The feed
(`app/page.tsx`) has the exact same kind of pagination control (same
`<Link variant="nav">`, portaled into the same footer slot), and its own
`app/loading.tsx`, but moving from one feed page to another showed **no**
loading skeleton at all.

**Root cause, confirmed empirically before designing a fix (not assumed):**
with an artificial 1.2–2s network delay injected via Playwright's
`route.continue()`, clicking "Next test" on `/tests/[id]` reliably showed
the `<PageLoading>` spinner, while clicking "Next page" on `/` showed
nothing — the old page just sat there until the new one snapped in, however
long the delay was. Next.js treats `/tests/[id1]` → `/tests/[id2]` as a full
dynamic-segment transition and suspends behind `loading.tsx`; `/?page=1` →
`/?page=2` only changes a searchParam on the *same* route, which Next.js
handles as a lighter-weight update that never reaches that same
`loading.tsx` Suspense boundary — a real, confirmed Next.js App Router
behavior difference between the two navigation shapes, not a bug in the
app's prior code.

**Decision:** wrap the feed's data-dependent content in an explicit
`<Suspense key={page} fallback={<PageLoading maxWidth="4xl" />}>` boundary
*inside* `app/page.tsx` itself, keyed on the current page number. Because
the `key` changes on every page navigation, React treats it as a fresh
subtree and shows the fallback while the new page's data streams in — this
works regardless of how Next.js classifies the navigation. Verified
directly: an experimental version of this change was applied to the running
dev server, the same delayed-network Playwright script was re-run and
showed the spinner appearing at the expected delay, and only then was the
real change written and the experiment reverted (`git status` confirmed
clean before proceeding).

**Files updated:**
- `app/page.tsx` — split into two functions:
  - `HomePage` (default export) — awaits `searchParams`, parses `page`,
    renders `<Suspense key={page} fallback={<PageLoading maxWidth="4xl" />}>`
    wrapping the new `FeedContent`.
  - `FeedContent` (new internal async component, not exported) — everything
    that used to be in `HomePage`'s body from the Supabase query onward
    (query, vote-count RPC, per-row `canSeeSystemInfo`/`isImported` shaping,
    the full `<PageShell>`/`<PageHeader>`/feed list/`<FooterPortal>`
    pagination JSX), unchanged apart from taking `page: number` as a prop
    instead of re-reading `searchParams` itself.
  - Reuses the existing `PageLoading` component
    (`components/ui/PageLoading.tsx`) — the same one `app/loading.tsx`
    already renders — so the fallback is pixel-identical to a cold visit to
    `/`. No new skeleton component needed.
  - `app/loading.tsx` itself is untouched and still correct — it only ever
    covers a cold/first visit to `/`; the new inner `<Suspense>` is what
    covers same-route page-to-page navigations, which never reach the outer
    boundary.
- `e2e/tests/public-feed.spec.ts` — new test, "shows a loading skeleton when
  navigating between feed pages on a slow connection", in the unauthenticated
  `Public feed` describe block: throttles every non-asset request 1.5s via
  `page.route(...)`, clicks "Next page", asserts the `role="status"` spinner
  becomes visible then disappears, and asserts the URL lands on `?page=2`.
  Early-returns (matching the existing empty-feed test's pattern) if the
  environment doesn't have a second feed page to click into.
- Docs: `components.md` (a note near the loading-state material explaining
  *why* the feed needed an explicit `<Suspense key>` where the two `[id]`
  pages don't, so a future reader doesn't "simplify" `app/page.tsx` back
  into one flat function and silently regress this on a slow connection),
  `testing.md` (E2E coverage row), `core.md` (§6 build-status bump),
  `build-history/index.md` (this row).

**Tests:**
- `e2e/tests/public-feed.spec.ts`'s new test (above) — run against a real
  local dev server, passing.
- No unit test added — this is a Suspense/data-fetching wiring change with
  no new pure logic to isolate; `FeedContent`'s body is the same code
  already exercised indirectly by the existing feed E2E specs.

**Verified:**
- `npm test` — 55 files / 567 tests, all passing (no unit-testable logic
  changed).
- `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step).
- `npx playwright test e2e/tests/public-feed.spec.ts` — 15/15 passing,
  including the new pagination-loading-skeleton test, run against a local
  dev server pointed at staging.
- `npx playwright test e2e/tests/voting.spec.ts e2e/tests/systems.spec.ts` —
  2 failures on the first run, both in the unrelated "Forum discussion link"
  block (`tests/[id]` forum-link visibility, nothing this step touches);
  re-ran that block alone and it passed 4/4 — confirmed pre-existing
  cross-session staging-propagation flakiness (the same class of lag
  `waitForServerState`'s own comments describe), not a regression from this
  step.
