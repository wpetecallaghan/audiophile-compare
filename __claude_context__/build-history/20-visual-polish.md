---
name: audiophile-compare-build-history-20
description: Build step 20 — Visual polish.
---

# ✅ 20 — Visual polish

Denser, more consistent, higher-contrast, modern look. No layout or feature
changes — purely presentation. Grounded in an audit of actual class usage,
not guesswork. Full design system reference now lives in `components.md §12`
— read that before touching any styling. Summary of what changed:

- **Type:** h2 section headings had three competing variants (`text-lg`,
  `text-base`, `text-base sm:text-lg`) — standardized on
  `text-base sm:text-lg font-semibold` everywhere. h1/body/metadata sizes
  were already consistent.
- **Color:** collapsed text-gray sprawl (7+ shades) to two roles — muted
  (`gray-500 dark:gray-400`) and a separate higher-contrast "readable body
  copy" tier (`gray-600 dark:gray-300`, e.g. `/about`'s prose — kept
  deliberately, not a bug). Fixed `gray-400` used unpaired in light mode
  (borderline-failing contrast on white, 73 occurrences). Collapsed borders
  to two roles (`gray-200/700` default, `gray-100/800` subtle). Unified all
  status badges to `outcomeLabel()`'s exact pairing (amber alone had 9
  different shades in use before). Fixed one component using `yellow-*`
  instead of the established `amber-*` warning color, and one blue "primary"
  button where every other primary action uses black.
- **Density:** page container padding `py-6 sm:py-10` → `py-4 sm:py-6`
  everywhere (11 files) plus one page on a divergent `py-12` pattern.
  Reduced `space-y-8`/`space-y-10` section gaps to `space-y-6`.
- **Buttons:** standardized to two roles × two size tiers (primary/secondary
  × standard/compact) — see `components.md §12`. Converted ~15 bare
  `<a>`/`<Link>`/`<button>` inline actions (edit, cancel, back, add-snapshot,
  add-component) to the bordered secondary style; left real page-navigation
  links (breadcrumbs, pagination, register/login CTAs) and the header's
  "Sign out" (grouped with nav links, not a form action) unstyled.

**Dark-mode contrast bug found via manual screenshot verification** (not
caught by code review or typecheck): every primary `bg-black` button was
invisible against the `#0a0a0a` dark-mode page background (`app/globals.css`).
Fixed by pairing every `bg-black`/`text-white` with `dark:bg-white
dark:text-black` (inverting on dark mode) — the same pattern already used in
`CreateTestForm.tsx`'s step indicator, now applied consistently everywhere.
This is why the plan explicitly calls for a real rendered check, not just a
class-name audit — screenshots in both color schemes caught something the
whole rest of this pass would have shipped broken.

**Verified:** full unit suite (25 files / 256 tests) and full E2E suite
(25/25) both green against a live dev server; manual Playwright screenshots
of home, about, login, systems list, and system detail pages in both light
and dark mode.

**Follow-up — componentized the pattern (post-step-20):** the manual class
consolidation above still meant hand-editing the same button/badge class
string in 15+ files — exactly the kind of drift that caused this step in the
first place. Added `components/ui/Button.tsx` and `Badge.tsx`
(`class-variance-authority` + `clsx`, see `docs/dependencies.md`) holding
each pairing in one place, then migrated every remaining raw `bg-black`
button and status-badge `<span>` across the app to them (`outcomeLabel()` in
`app/systems/[id]/page.tsx` now returns a `status` key instead of a `cls`
string). See `components.md §12` for usage. One-off single-use styles (the
amber confirm/trigger buttons in `RevealButton.tsx`) were deliberately left
as raw classes rather than forcing them into a variant used exactly once.
Also fixed a few unpaired dark-mode colors turned up along the way (green
success-message text, a stray `border` missing its light-mode shade). Full
unit suite, full E2E suite, and light/dark screenshots verified again after
migration — all green, pixel-identical to before.
