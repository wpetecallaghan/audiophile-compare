---
name: audiophile-compare-build-history-74
description: Build step 74 — Fix footer visibly changing height across feed pagination and on the test detail page; hide Privacy/Terms on mobile when nav is present.
---

# ✅ 74 — Fix: footer height changes across pagination; prioritize nav over Privacy/Terms on mobile

**The bug:** navigating from feed page 1 to page 2 visibly expanded the
global footer to a second line; the same happened on the test detail
page. Measured directly (Playwright, 390×844 viewport): footer height
61px on feed page 1, 85px on page 2 — a real, reproducible layout jump,
not a one-off visual glitch.

**Root cause:** `SiteFooter.tsx`'s container was a single `flex flex-wrap
items-center justify-between` row holding two children — the Privacy/Terms
links, and the page-specific nav slot (`FooterPortal` content, §14). Feed
page 1 only shows Next/Last (2 controls) — narrow enough to fit alongside
Privacy/Terms on one line. Page 2+ also shows First/Previous (4 controls)
— wider, no longer fits, so the whole nav-slot child wraps to its own
line, and `min-h-14` plus the wrapped line pushes the footer taller. The
test detail page's nav (up to 5 controls: First/Previous/All/Next/Last)
hits the same overflow. This got materially worse after step 68 grew each
control's touch target to 44×44px — bare 16px icons had enough headroom
to avoid this; five 44px targets plus gaps often don't.

**The fix:** `components/SiteFooter.tsx` — the outer container is now
`flex flex-col sm:flex-row sm:items-center sm:justify-between` instead of
`flex flex-wrap items-center justify-between`. Below the `sm:` breakpoint,
Privacy/Terms and the nav slot always get their own row, regardless of how
many controls the nav slot happens to contain — height now depends only
on "is there nav content at all," never on the control count. An empty
nav slot (routes with nothing portaled in) still collapses to zero height,
so the footer stays its original short single-row height there. Above
`sm:`, the original side-by-side single-row layout is unchanged (verified
— plenty of width at that breakpoint for even the 5-control case).

**Follow-up refinement, same step:** after testing all pages on real
mobile viewports, decided the flex-col stacking alone wasn't enough —
mobile footer space is tight, and step-through navigation is more
important there than the Privacy/Terms links. Added: Privacy/Terms are
now hidden entirely on mobile (`max-sm:`) whenever the nav slot has
content, via Tailwind's `group`/`group-has-[#page-nav-slot:not(:empty)]`
variants on `SiteFooter.tsx`'s outer container. Both links still show
together with the nav at `sm:` and up (plenty of room there), and both
still show on mobile when there's no nav to prioritize (e.g. `/about`).
The literal `page-nav-slot` in that selector has to match
`FOOTER_NAV_SLOT_ID` directly — Tailwind's JIT scans this file's raw
source text for class-name patterns, so a class built from an
interpolated JS constant wouldn't be picked up; see `components.md §14`
for the full note.

**Second follow-up refinement, same step:** the `group-has-[...]` check
only sees content actually in the DOM — during a route's `loading.tsx`
skeleton, nothing has been portaled into the nav slot yet regardless of
whether the loaded page will show nav, so Privacy/Terms visibly showed
for the entire loading/streaming window on routes that end up with nav,
then disappeared the instant real content replaced the skeleton — the
same flash-then-hide jank, just relocated to the loading phase instead of
fixed. `PageLoading` (`components/ui/PageLoading.tsx`) now takes a
`hasFooterNav?: boolean` prop — when true, it portals an empty `<span>`
into the nav slot itself (the same `FooterPortal`), enough to satisfy
`:not(:empty)` and hide Privacy/Terms immediately, before real nav
content ever exists. Set on the three call sites whose real page always
(`tracks/[id]/loading.tsx` — `navBackHref` is unconditionally `/tracks`
there) or usually (`app/page.tsx`'s pagination Suspense fallback,
`tests/[id]/loading.tsx` — both approximations, since whether nav
actually renders depends on data not known until it resolves) shows
footer nav.

**Files updated:**
- `components/SiteFooter.tsx` — flex-col stacking + mobile-only
  Privacy/Terms hiding.
- `components/ui/PageLoading.tsx` — new `hasFooterNav` prop, portals an
  empty marker into the nav slot when set.
- `app/page.tsx`, `app/tests/[id]/loading.tsx`, `app/tracks/[id]/loading.tsx`
  — pass `hasFooterNav` at their three call sites.
- `e2e/tests/public-feed.spec.ts` — three regression tests: footer height
  equal between feed page 1 and page 2 at a 390px viewport (waits for
  page 2's own Previous control to actually mount via `FooterPortal`
  before measuring, avoiding a race against the portal's client-side
  mount); Privacy/Terms visibility across all three states (no nav on
  mobile → visible, nav on mobile → hidden, nav on desktop → visible);
  and — folded into the existing step-66 slow-connection test, which
  already sets up the identical throttled transition — Privacy/Terms
  stay hidden while the loading skeleton itself is showing, not just
  once real content replaces it.
- Docs: `components.md §14` (three new paragraphs — layout guarantee,
  mobile-hide refinement, loading-skeleton refinement), this file,
  `build-history/index.md`, `core.md` (§6 bump), `testing.md` (E2E
  coverage row).

**Tests:**
- `e2e/tests/public-feed.spec.ts`'s three tests (above).

**Verified:**
- Reproduced directly with a real Playwright script before the fix
  (390×844 viewport): 61px → 85px between feed pages 1 and 2.
- After the flex-col fix, re-measured the same way: 85px on feed page 1,
  85px on feed page 2, 85px on the test detail page (all with nav content
  present) — constant. Desktop (1280×900) unaffected: 61px, single row,
  unchanged from before the fix.
- After the mobile-hide refinement, re-verified with a real Playwright
  script across all three states: `/about` (no nav) shows Privacy on
  mobile; feed page 1 (nav present) hides it on mobile; feed page 2 on a
  1280px viewport shows it again alongside the nav — confirmed visually
  via screenshots, not just DOM presence.
- After the loading-skeleton refinement, reproduced the exact failure
  first (throttled page-1-to-page-2 transition, polling every 200ms):
  Privacy stayed visible right up until the moment the spinner appeared.
  With the fix, re-ran the same polling loop — Privacy stayed hidden
  throughout, including at the moment the spinner (`role="status"`) was
  confirmed visible.
- `npx tsc --noEmit` — no new errors.
- `npm test` — 57 files / 571 tests, all passing (no unit test touches
  this — layout-only, verified via the new E2E geometry/visibility tests
  instead).
- `npx playwright test e2e/tests/public-feed.spec.ts` — 21/21 passing,
  including all three new/extended tests.
