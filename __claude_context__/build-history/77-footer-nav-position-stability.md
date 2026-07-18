---
name: audiophile-compare-build-history-77
description: Build step 77 — Fix First/Previous/Next/Last footer nav controls visibly shifting position at list boundaries, by rendering disabled buttons instead of omitting controls from the DOM.
---

# ✅ 77 — Footer step-through nav no longer shifts position at boundaries

**The problem, reported directly:** the First/Previous/Next/Last controls
in the global footer (test-detail page-to-page nav, track-to-track nav,
and the feed's own numbered pagination) visibly jumped position when
transitioning between the first/second item and between the last/
second-to-last item — cumbersome for rapid step-through clicking, since
the control you just clicked wasn't where you expected it on the next
screen.

**Root cause:** all three nav locations share the same conditional-render
pattern via the shared `FooterNavLink` component —
`{firstId && <FooterNavLink .../>}`, `{hasPrev && <FooterNavLink .../>}`,
etc. — which removed a control from the DOM entirely at a boundary
rather than disabling it. With no reserved space in the surrounding
`flex items-center gap-3`/`gap-2` row, the remaining controls reflowed
horizontally every time a boundary control popped in or out.

**Fix:** `components/ui/FooterNavLink.tsx`'s `href` prop is now
`string | null`. A `null` href renders a disabled `<button type="button"
disabled>` in the exact same `flex items-center justify-center w-11 h-11
rounded-full` slot the enabled `<Link>` uses, styled `text-gray-500
dark:text-gray-400 disabled:opacity-40` (see the follow-up finding below
for why the base color, not just the opacity, matters). All three call
sites changed from `{condition &&
<FooterNavLink href={...} .../>}` to an unconditional `<FooterNavLink
href={condition ? '...' : null} .../>`:
- `app/tests/[id]/page.tsx`'s `TestNavFooter` (First/Previous/Next/Last).
- `app/tracks/[id]/page.tsx` (identical shape).
- `app/page.tsx`'s feed pagination (First/Previous/Next/Last, gated on
  `hasPrev`/`hasNext`). The outer `{(hasPrev || hasNext) && (...)}` gate
  around the whole nav block is untouched — that decides whether
  pagination shows *at all* (nothing to paginate on a true single-page
  feed), a separate, correct concern from the boundary-shift bug.

No changes to `components/ui/Link.tsx` — it has no disabled-state
facility and `NextLink`'s `href` typing is non-optional, so the disabled
branch lives entirely inside `FooterNavLink`, which simply never calls
`Link` when `href` is `null`.

**A side benefit, not just a fix:** a disabled control now visibly
communicates "you're at this boundary" instead of silently vanishing —
the same pattern GitHub's and Google's own paginators use.

**Real follow-up bug, reported directly after the first version shipped:**
"the visible difference between enabled vs disabled navigation buttons is
too low on both dark and light modes." Root cause: the first version's
disabled button applied only `disabled:opacity-40` (this codebase's
existing dimming convention, `components/ui/Button.tsx`'s `buttonVariants`
and `components/ui/ConfirmButton.tsx`) with no explicit base text color —
so it dimmed whatever it inherited, which is the page's near-black/
near-white body foreground (`app/globals.css`'s `--foreground: #171717`
light / `#ededed` dark), not the enabled `Link`'s own muted
`text-gray-500 dark:text-gray-400`. `Button.tsx`'s own buttons have a
strong solid background/text color for `opacity-40` to visibly dim
against; this icon-only button had neither. Computing the actual
composited colors confirmed the bug: 40%-opacity near-black-on-white
composites to ≈`rgb(162,162,162)` versus the enabled control's own
un-dimmed `gray-500` at ≈`rgb(107,114,128)` — a real but modest ~55-unit
gap; 40%-opacity near-white-on-near-black in dark mode composites to
≈`rgb(101,101,101)` versus enabled `gray-400`'s ≈`rgb(156,163,175)`, a
similarly modest gap. Both directions were technically "dimmer," just not
by enough to read as unambiguously disabled at icon scale, in either
theme — confirmed visually via screenshot comparison in both
`colorScheme: 'light'` and `'dark'` Playwright contexts before and after
the fix. Fixed by explicitly starting the disabled button from the exact
same `text-gray-500 dark:text-gray-400` the enabled `Link` uses, *then*
dimming that — composites to ≈`rgb(196,199,204)` (light) and
≈`rgb(68,71,75)` (dark), roughly a 90-unit gap from the enabled state in
both themes, a much larger and more consistent contrast than dimming the
page's full-strength foreground color.

**Files updated:**
- `components/ui/FooterNavLink.tsx` — `href: string | null`, new disabled
  branch, explicit `text-gray-500 dark:text-gray-400` base color.
- `app/tests/[id]/page.tsx`, `app/tracks/[id]/page.tsx`, `app/page.tsx` —
  unconditional `FooterNavLink` calls, `href` ternaries.
- Docs: `components.md §14` (corrected the now-inaccurate "conditionally
  rendered... hides that control entirely" line and code sample), this
  file, `build-history/index.md`, `core.md` (§6 bump).

**Tests:**
- `components/ui/__tests__/FooterNavLink.test.tsx` — 4 new tests for the
  `href: null` branch: renders a disabled `<button>` (not a `link` role),
  keeps the 44×44 sizing, carries `disabled:opacity-40`, and starts from
  the same `text-gray-500 dark:text-gray-400` base color the enabled
  `Link` uses (the contrast follow-up). Existing 2 tests (happy-path
  href) unmodified.
- `e2e/tests/voting.spec.ts`'s "Footer step-through nav" describe block —
  the existing First/Last boundary assertions switched from
  `getByRole(ROLE.link, ...).not.toBeVisible()` to
  `getByRole(ROLE.button, ...).toBeDisabled()`, since the control is now
  always present just non-interactive. New test: records Previous's
  `boundingBox()` while enabled, clicks First, asserts the now-disabled
  Previous button's `boundingBox()` is at the identical `x`/`y` — the
  direct regression guard for the reported bug, not just a
  presence/visibility check.
- `e2e/tests/public-feed.spec.ts` — same new position-stability test for
  page 1 → page 2 (Previous disabled → enabled, position unchanged). The
  existing footer-height-constant test's wait condition
  (`getByRole(ROLE.link, {name: previousPage}).toBeVisible()` after
  paging) needed no change — it already correctly detects "page 2's
  Previous became an enabled link," since a disabled button never matches
  a `link` role query; only its explanatory comment (which described the
  old "2 controls vs. 4 controls" control-count difference) was corrected
  since the control count is now always 4.

**Verified:**
- `npx tsc --noEmit` — no new errors.
- `npm test` — 61 files / 608 tests, all passing.
- Full local e2e suite (`E2E_BASE_URL=http://localhost:3000`).
- Manual check in a real browser: stepped through a multi-item test-detail
  nav and feed pagination across both boundaries — no visible shift,
  boundary controls read as disabled/dimmed in place.
