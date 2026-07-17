---
name: audiophile-compare-build-history-74
description: Build step 74 — Fix footer visibly changing height across pagination; prioritize nav over Privacy/Terms on mobile, decided server-side by route.
---

# ✅ 74 — Fix: footer height changes across pagination; prioritize nav over Privacy/Terms on mobile

**The bug:** navigating from feed page 1 to page 2 visibly expanded the
global footer to a second line; the same happened on the test detail
page. Measured directly (Playwright, 390×844 viewport): footer height
61px on feed page 1, 85px on page 2 — a real, reproducible layout jump.

**Root cause:** `SiteFooter.tsx`'s container was a single `flex flex-wrap
items-center justify-between` row holding two children — the Privacy/Terms
links, and the page-specific nav slot (`FooterPortal` content, §14). Feed
page 1 only shows Next/Last (2 controls) — narrow enough to fit alongside
Privacy/Terms on one line. Page 2+ also shows First/Previous (4 controls)
— wider, no longer fits, so the whole nav-slot child wraps to its own
line. `tests/[id]`'s nav (up to 5 controls) hits the same overflow. This
got materially worse after step 68 grew each control's touch target to
44×44px.

**Fix 1 — constant footer height:** `components/SiteFooter.tsx`'s outer
container is now `flex flex-col sm:flex-row sm:items-center
sm:justify-between` instead of `flex flex-wrap items-center
justify-between`. Below `sm:`, Privacy/Terms and the nav slot always get
their own row regardless of control count — height depends only on "is
there nav content at all." An empty nav slot still collapses to zero
height, so routes with no nav keep their original short footer. Above
`sm:`, unchanged (plenty of width there even for the 5-control case).

**Fix 2 (superseded by fix 3, see below) — hide Privacy/Terms on mobile
when nav is present:** after testing on real devices, mobile footer space
was still judged too tight to show both groups even stacked — step-through
navigation should win outright there. First attempt: a CSS
`group-has-[#page-nav-slot:not(:empty)]:hidden` rule on `SiteFooter`,
keyed off whether `FooterPortal` had actually mounted content into the
nav slot, `max-sm:` scoped. Extended to `PageLoading` (a `hasFooterNav`
prop portaling an empty marker span) so the same hiding applied during
the loading skeleton too, not just after real content mounted.

**Fix 3 — replaced the DOM-content check with a pathname check:**
observed directly on two real mobile devices that Privacy/Terms still
flickered briefly during page-to-page navigation despite fix 2. Root
cause: `FooterPortal` mounts via a client-side `useEffect`, which has an
unavoidable brief gap — both on first hydration and, more visibly,
between the *old* page's portal unmounting and the *new* page's mounting
on every subsequent transition — during which the nav slot genuinely
reads as empty in the DOM. That gap is small enough to never show up in
fast local/CI testing but was a real, visible flicker on real hardware.
Fixed by moving the decision to something with no such gap: **the current
pathname**. New client component,
`components/ui/FooterPrivacyLinks.tsx` — matches `usePathname()` against
route patterns for `/`, `/tests/[id]`, `/tracks/[id]` (the three routes
whose real content shows footer nav) and applies `max-sm:hidden`
directly, no portal/DOM-content dependency at all. `usePathname()`
resolves synchronously, including during the server render itself, so
the correct class is present in the raw SSR HTML before any client JS
executes — eliminating the gap entirely rather than shrinking it. This
also made fix 2's `PageLoading`/`hasFooterNav` plumbing unnecessary and
it was removed: pathname doesn't change between a route's loading and
loaded states, so the same mechanism now covers both without needing a
separate loading-specific case.

**Files updated:**
- `components/SiteFooter.tsx` — flex-col stacking (fix 1); now renders
  `<FooterPrivacyLinks />` instead of an inline Privacy/Terms div (fix 3);
  no longer `async` (no server-side translation call left in this file).
- `components/ui/FooterPrivacyLinks.tsx` (**new**) — the pathname-matched
  client component described above.
- `components/ui/PageLoading.tsx`, `app/page.tsx`,
  `app/tests/[id]/loading.tsx`, `app/tracks/[id]/loading.tsx` — fix 2's
  `hasFooterNav` prop and portal-marker logic added, then removed once
  fix 3 made it redundant.
- `e2e/tests/public-feed.spec.ts` — four regression tests: footer height
  equal between feed page 1 and page 2 at a 390px viewport; Privacy/Terms
  visibility across all three states (no nav on mobile → visible, nav on
  mobile → hidden, nav on desktop → visible); the same check with
  JavaScript disabled entirely, proving the SSR HTML alone is already
  correct; and the step-66 slow-connection test extended to poll
  Privacy/Terms visibility every 100ms throughout an actual throttled
  page-to-page transition, rather than checking once.
- Docs: `components.md §14` (rewritten to describe fix 3 as the current
  state, with fix 2's rejected approach explained inline so a future
  reader doesn't reintroduce it), this file, `build-history/index.md`,
  `core.md` (§6 bump), `testing.md` (E2E coverage row).

**Tests:**
- `e2e/tests/public-feed.spec.ts`'s four tests (above).

**Verified:**
- Reproduced directly with a real Playwright script before fix 1
  (390×844 viewport): 61px → 85px between feed pages 1 and 2. After fix
  1: 85px on feed page 1, page 2, and the test detail page — constant.
  Desktop (1280×900) unaffected: 61px, unchanged.
- Fix 2 verified working in the same kind of Playwright script (DOM
  visibility checks at fixed points) — but that method is exactly what
  missed the real-device flicker, since it doesn't poll continuously
  through a transition.
- Fix 3 verified three ways: (1) raw `fetch()` of the SSR HTML confirms
  `max-sm:hidden` is present for `/` and absent for `/about`, with zero
  client JS involved; (2) a `javaScriptEnabled: false` Playwright context
  shows the same correct hidden/visible states; (3) polling Privacy
  visibility every 80-100ms through an actual throttled page-to-page
  transition never once caught it visible, unlike fix 2 under the same
  polling method.
- `npx tsc --noEmit` — no new errors.
- `npm test` — 57 files / 571 tests, all passing (no unit test touches
  this — layout/routing-only, verified via the E2E tests above instead).
- `npx playwright test e2e/tests/public-feed.spec.ts` — 22/22 passing.
