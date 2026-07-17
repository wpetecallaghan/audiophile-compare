---
name: audiophile-compare-build-history-68
description: Build step 68 — Bigger touch targets for footer step-through nav.
---

# ✅ 68 — Bigger touch targets for footer step-through nav

**The gap this closes:** the First/Previous/All/Next/Last step-through
controls (`components.md §14`, step 61) render a bare 16px icon
(`<Icon className="w-4 h-4" />`) inside a `<Link variant="nav">` with **no
padding at all** — confirmed by reading every call site
(`app/tests/[id]/page.tsx`, `app/tracks/[id]/page.tsx`, `app/page.tsx`'s
feed pagination). The actual clickable `<a>` box was only as big as the
icon itself, ~16×16px — well under the ~44×44px minimum widely recommended
for a touch target (iOS HIG's 44pt, WCAG 2.5.5's target-size AAA
criterion), and hard to land with a fingertip on a real phone or tablet.
Adjacent controls in the same row are only `gap-3` (12px, `gap-2` on the
feed) apart, so mis-taps between neighbors were also likely.

**Decisions:**

1. **Scoped to the icon-only controls, not every `variant="nav"` link.**
   `variant="nav"` is shared with plain text nav links (`SiteHeader`'s
   "About"/"Systems"/"Tracks"/"Profile"/"Sign in", `SiteFooter`'s
   "Privacy"/"Terms") — those are already a reasonable tap width as
   multi-character text and weren't what was reported. The shared `nav`
   variant's base styling in `Link.tsx` is untouched; only the five
   icon-only controls change.

2. **"All" (the `ListIcon` control) is included alongside First/Previous/
   Next/Last**, even though only four were named — it's the identical
   bare-icon `Link` sitting in the same row on `tests/[id]` and
   `tracks/[id]`; leaving it small while enlarging its four neighbors would
   be inconsistent and leave the identical problem half-fixed.

3. **Extracted a shared `FooterNavLink` component**
   (`components/ui/FooterNavLink.tsx`) rather than hand-editing
   `className` at all 15 call sites (5 controls × 3 pages) — the exact
   `<Link href variant="nav" aria-label><Icon className="w-4 h-4" /></Link>`
   shape was already hand-duplicated that many times, and touch-up-in-place
   risks the same drift this codebase's own `RowCard`/`PageHeader`/
   `getAdjacentIds` extractions were done to avoid. `FooterNavLink` takes
   `href`, `aria-label`, and an icon `children`, and renders:
   `flex items-center justify-center w-11 h-11 rounded-full
   hover:bg-gray-100 dark:hover:bg-gray-800`. `w-11 h-11` = 2.75rem = 44px,
   Tailwind's default scale — no arbitrary value needed. The icon's own
   visual size (`w-4 h-4`) is unchanged; only the invisible padding around
   it grows the actual hit area, plus a rounded hover fill so the tappable
   region is visible on desktop too, not just bigger. `active:opacity-60`
   already comes from `linkVariants`' shared base class, unaffected.

4. **No change to `FooterPortal.tsx`, `SiteFooter.tsx`, or the existing
   `gap-2`/`gap-3` row spacing** — growing each control to a 44px box
   already gives ample visual separation without touching the pre-existing
   (and already slightly inconsistent between the feed and the two `[id]`
   pages — not this step's job to unify) gap values.

**Files updated:**
- `components/ui/FooterNavLink.tsx` (**new**).
- `app/tests/[id]/page.tsx`, `app/tracks/[id]/page.tsx`, `app/page.tsx` — 5
  call sites each swapped from `<Link variant="nav">` to `<FooterNavLink>`;
  `tracks/[id]/page.tsx`'s now-unused `Link` import removed (no other
  `<Link>` in that file).
- `components/ui/__tests__/FooterNavLink.test.tsx` (**new**, 2 tests):
  renders the icon child with the right `href`/`aria-label`; carries the
  `w-11`/`h-11` sizing classes. Real pixel geometry isn't checked here —
  jsdom doesn't do real layout — that's what the new E2E test is for.
- `e2e/tests/public-feed.spec.ts` — new test, "feed pagination controls
  have at least a 44x44 touch target": a real `boundingBox()` geometry
  check on the "Next page" control, since nothing in the suite verified
  element size before this. No mobile-specific Playwright project needed —
  the sizing classes aren't viewport-conditional, so the box is 44×44
  regardless of viewport width.
- Docs: `components.md §14` (documents `FooterNavLink`, replaces the old
  hand-rolled JSX snippet shown there), this file, `build-history/index.md`,
  `core.md` (§6 bump), `testing.md` (unit + E2E coverage rows).

**Tests:**
- `components/ui/__tests__/FooterNavLink.test.tsx` (new, 2 tests): icon
  child + `href`/`aria-label` passthrough; sizing classes present.
- `e2e/tests/public-feed.spec.ts`'s new geometry test (above) — run against
  a real local dev server, passing.

**Verified:**
- `npm test` — 56 files / 569 tests, all passing.
- `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step).
- `npx playwright test e2e/tests/public-feed.spec.ts e2e/tests/voting.spec.ts
  e2e/tests/systems.spec.ts` — 30/31 passing on the first run; the one
  failure (`systems.spec.ts`'s "edit the system name and description",
  unrelated to any file this step touches) passed cleanly on an isolated
  re-run, confirming pre-existing flakiness, not a regression from this
  step.
