---
name: audiophile-compare-build-history-21
description: Build step 21 — Link component.
---

# ✅ 21 — Link component

Same motivation as the step-20 follow-up: `<Link>`/`<a>` styling was
hand-copied class strings, which is exactly the pattern that let the step-20
bugs propagate. Grounded in an audit of real usage across `app/` and
`components/` (excluding `components/ui/`), same process as the Button/Badge
audit.

**Audit findings (grep on exact className strings, one `<a>`/`<Link>` role
already covered by `buttonVariants()` excluded — e.g. `ProfileForm.tsx`,
`EditSystemForm.tsx`, the systems detail "Edit" link):**

- **Nav link** — `text-sm text-gray-500 dark:text-gray-400
  hover:text-gray-900 dark:hover:text-gray-100` (+ `shrink-0` on 4 of 5) —
  **5 occurrences, all in `SiteHeader.tsx`** (About, Systems, Tracks,
  Profile, Sign in).
- **Card link** — `rounded border border-gray-200 dark:border-gray-700
  px-3 sm:px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800
  transition-colors`, prefixed with either `block` (`app/systems/page.tsx`,
  `FeedCard.tsx`) or `flex items-center justify-between`
  (`app/tracks/page.tsx`, `app/tracks/[id]/page.tsx`, the test list in
  `app/systems/[id]/page.tsx`) depending on whether the Link itself is the
  flex container or wraps one — **5 occurrences**, shared part identical.
- **Breadcrumb link** — bare `hover:underline`, no color/size classes of its
  own (relies on ambient text color) — **6 occurrences**: `tracks/[id]`,
  `register`, `systems/[id]/edit` (×2), `systems/[id]`, `LoginTabs.tsx`. One
  utility class is likely too trivial to justify a component — same call as
  leaving `RevealButton.tsx`'s one-off amber buttons raw.
- **Inline CTA link** — `text-blue-600`, plus size/hover variants that
  disagreed with each other: `text-sm text-blue-600 hover:underline` (5:
  `page.tsx` pagination ×2, `about/page.tsx` ×2), `text-blue-600 underline`
  with no `hover:` (5: `page.tsx`, `tracks/page.tsx`, `systems/page.tsx`
  empty-state CTAs, plus `tests/[id]/page.tsx`'s "sign in to listen" — which
  was also the one instance of this role on a plain `<a href="/login">`
  instead of `next/link`'s `Link`, losing client-side navigation), and
  `text-xs text-blue-600 hover:underline` (1: `CrossCheckSelector.tsx`,
  itself another plain `<a>` instead of `Link`). Unlike the deliberate
  `gray-500/400` vs `gray-600/300` two-tier split kept in step 20, this
  3-way split had no matching semantic distinction — same CTA role,
  inconsistent `hover:` treatment — so it read as drift, not design. Fixed
  by standardizing on `text-sm text-blue-600 hover:underline`, fixing both
  stray `<a>`s to `Link`, and treating the one `text-xs` instance as a
  `size="compact"` variant prop rather than a raw `className` override —
  `cn()`/`clsx` doesn't dedupe conflicting Tailwind utilities the way
  `tailwind-merge` would, so appending `className="text-xs"` on top of a
  variant that already sets `text-sm` would not reliably win.
  `ChangePasswordForm.tsx`'s `text-sm text-blue-600 hover:underline` looked
  like a fifth instance of this role from a className grep alone, but it's a
  `<button type="button">` disclosure toggle, not a link — left alone,
  same call as the amber `RevealButton.tsx` buttons in step 20.

**Shape built:** one `components/ui/Link.tsx`, mirroring `Button.tsx`'s
structure — a `cva` config with a `variant` prop (`nav | card | inline`) and
a `size` prop (`standard | compact`, scoped to `inline` only via
`compoundVariants`) on top of `next/link`'s `Link`, not a plain `<a>`.
`card`'s shared border/hover classes live in the variant; the `block` vs
`flex items-center justify-between` split stays a per-call-site `className`
override (real layout difference, not a styling inconsistency to force into
one shape). `variant="breadcrumb"` was deliberately **not** built — a single
utility class repeated 6 times doesn't clear the bar that justified
`Button`/`Badge` (15+ files, multi-class strings, a real dark-mode bug from
copy-paste drift) — those 6 `hover:underline` breadcrumb links were left as
plain `next/link` `Link`s.

The empty-state CTAs' always-on `underline` was folded into `inline`
(now `hover:underline` like the majority) rather than kept as a distinct
"prominent" sub-variant — same drift as the size/hover split, not a
deliberate design choice.

**Verified:** full unit suite (25 files / 256 tests) and full E2E suite
(25/25) both green; `tsc --noEmit` shows no new errors (pre-existing,
unrelated vitest-mock typing errors in `__tests__/supabase-*.test.ts` are
untouched by this change); manual Playwright screenshots of home, about,
systems, tracks, track detail, and test detail pages in both light and dark
mode, authenticated and unauthenticated.
