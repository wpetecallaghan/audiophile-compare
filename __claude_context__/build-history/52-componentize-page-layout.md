---
name: audiophile-compare-build-history-52
description: Build step 52 — componentize repeated page-level DOM/styling.
---

# ✅ 52 — Componentize repeated page-level DOM/styling

**The gap this closed:** step 22 componentized element-level primitives
(`Heading`, `FieldLabel`, `TextField`, `FormMessage`, `Callout`) but never
went a layer up to the page level. You flagged `app/about/page.tsx` as the
concrete example: its `<main>` wrapper, four `<section className="space-y-3">`s,
and eight `<p className="text-sm text-gray-600 dark:text-gray-300">`s, all
raw, all repeated.

## Review

Surveyed all 17 `app/**/page.tsx` files via three parallel read-only
audits (split by page group, cross-referenced against each other to catch
patterns spanning multiple groups). Found 12 candidate components. Given
the scope — nearly every page in the app, no automated visual-regression
tooling in this project, only functional E2E — chose to implement the two
safest/highest-count extractions plus three more structural ones (Tier 1 +
Tier 2), catalogued the rest for future steps rather than attempting all
12 in one pass:

**Implemented this step:**
1. `PageShell` — the `<main>` wrapper. 16 of 17 pages (all but `login`/`register`).
2. `Text` — muted caption (`text-{xs|sm} text-gray-500 dark:text-gray-400`)
   and body-copy (`text-sm text-gray-600 dark:text-gray-300`) text. 60+
   occurrences, the single highest-count pattern found.
3. `Section` — `<section className="space-y-3">`, optional heading. 20+
   occurrences in about/privacy/terms, also profile.
4. `RowCard` — the list-item card pattern, independently duplicated (with
   small unintentional divergences) in `FeedCard.tsx`, `systems/page.tsx`,
   `systems/[id]/page.tsx`, `tracks/page.tsx`, `tracks/[id]/page.tsx`.
5. `PageHeader` — title/subtitle/eyebrow/actions block. Fits `app/page.tsx`,
   `profile.tsx`, `systems/[id]/page.tsx`, both admin pages.

**Catalogued, not implemented** (documented so they don't need
re-discovering): `Breadcrumbs` (3 sites, plus a noted gap — `tests/[id]`
has no breadcrumb despite being an equally deep page), `AuthShell`
(`login`/`register`'s centered-card wrapper, which also hand-roll a raw
non-responsive `<h1 className="text-2xl font-semibold">` instead of
`Heading`), `ClipHealthWarning` (within `tests/[id]/page.tsx` only),
`Divider` (`register`'s "or" separator; `profile`'s 4× `<hr>`), `Byline`
(the creator/date/vote-count/imported-badge line duplicated between
`tracks/[id]` and `tests/[id]`, which touches the `isImported` derivation
logic too, not just styling — deliberately deferred), `SectionHeading`
(title + trailing pluralized count), `ButtonRow` (four action-row layouts
with real, small alignment/gap differences — lowest-confidence candidate).
`profile.tsx`'s two raw `text-sm font-semibold` `<h2>` sub-headings are a
genuinely smaller size than `Heading level={2}` (same judgment call as
`ChangePasswordForm.tsx`'s own disclosure heading in step 22) — left alone.

## Component APIs

All five follow the existing `cva`/`cn()`/thin-wrapper shape
(`Badge.tsx`, `Heading.tsx`) — no new pattern introduced. Full docs +
usage examples: `__claude_context__/components.md` §13.

- **`PageShell`** — `maxWidth: '2xl' | '4xl'` (required), `spacing:
  'normal' | 'responsive'` (default `'normal'`; only `tests/[id]/page.tsx`
  needs `'responsive'`, for its one-off `space-y-4 sm:space-y-6`).
- **`Text`** — `size: 'xs' | 'sm'` (default `'sm'`), `tone: 'muted' |
  'body'` (default `'muted'`), `as: 'p' | 'span'` (default `'p'`).
- **`Section`** — optional `heading` prop, renders `Heading level={2}`
  first when present.
- **`RowCard`** — `href`, `title`, optional `subtitle`/`trailing`. The 5
  real call sites had small unintentional divergences (`items-start` vs
  `items-center`, `ml-4` vs `gap-4`, presence/absence of `truncate`) —
  resolved onto one canonical layout (`items-start`, `gap-4`, always
  `truncate`, `min-w-0 space-y-0.5` title block) rather than preserved via
  a variant, matching how step 22 converged `FieldLabel`'s three
  disagreeing "muted" colors onto one. **First pass picked `items-center`
  (the majority — 3 of 5 original sites) and shipped it uncommitted; a
  real side-by-side visual diff against staging caught the one actual
  regression — `FeedCard.tsx`'s badge visibly re-centering against its
  multi-line subtitle block, the one non-neutral visual change out of the
  whole step.** Switched the canonical choice to `items-start` instead
  (matching `FeedCard.tsx`'s and `systems/page.tsx`'s original alignment)
  — a deliberate trade of *which* 2-of-5 sites shift instead of avoiding
  the trade entirely: `systems/[id]/page.tsx` and both `tracks/*` pages
  (originally `items-center`) now shift to `items-start` instead.
  `FeedCard.tsx`'s trailing badge keeps its original `mt-0.5` nudge via
  `className` passthrough on `Badge`; none of the newly-`items-start`
  sites had that nudge before, so none gained one.
- **`PageHeader`** — `title` (required), optional `eyebrow`/`subtitle`/
  `actions`/`children` (children render below subtitle, e.g. a
  snapshot-count meta line). Designed by reading all 5 real call sites
  side-by-side first, not speculatively — `app/page.tsx`'s original
  markup had `actions` flanking the *whole* title+subtitle block, while
  `systems/[id]/page.tsx`'s had `actions` flanking just the title with
  subtitle full-width below; these are genuinely different flex
  boundaries (subtitle's available width differs when actions text is
  long), not a coincidence. `PageHeader` standardizes on the
  `systems/[id]` shape (actions flank the title only) — a small,
  deliberate consolidation of `app/page.tsx`'s markup onto the more
  robust arrangement, not a silent "hope it looks the same."

**Not touched by `PageHeader`:** `tracks/[id]/page.tsx` and
`tests/[id]/page.tsx` both have richer headers (eyebrow + a multi-line
byline, not a single subtitle) that don't fit the one-`subtitle`-slot
shape — forcing them in would drop content or need a mismatched shape.
Left as raw JSX (with `Text`/`PageShell` still applied) pending a future
`Byline` component.

## Verification

No visual-regression tooling exists in this project — real safety net was
care during implementation (checking generated `cva` output was the same
*class set* as what it replaced, just reordered — CSS is order-independent)
plus the existing test suites:
- `npx tsc --noEmit` — clean throughout, checked after every file.
- `npm run test` — 42 files / 482 tests, unchanged (no unit tests exist
  for these page files; this step is pure markup restructuring).
- `curl` spot-check against a local dev server confirmed `PageShell`'s
  rendered class set matches the original string exactly (same classes,
  different order).
- Full local E2E suite (`npx playwright test`) — 62/62 passing, no
  regressions. Every touched page has E2E coverage asserting visible
  text/roles, which would have caught a dropped slot or broken link even
  without pixel comparison — but E2E asserts text/roles, not layout, so it
  could not and did not catch the `RowCard` alignment change below.
- **What actually caught the one real visual regression: a manual
  side-by-side comparison of the local deployment against staging**,
  after implementation — none of the automated checks above are capable
  of catching a pure vertical-alignment shift. Confirms this project
  genuinely has no substitute for an eyes-on check when a step touches
  this much shared visual structure at once.

## Files touched

19 files: 5 new (`components/ui/PageShell.tsx`, `Text.tsx`, `Section.tsx`,
`RowCard.tsx`, `PageHeader.tsx`), `components/feed/FeedCard.tsx`, and 13 of
17 `app/**/page.tsx` files (`about`, `privacy`, `terms`, `version`,
`tests/new`, `admin/claim`, `admin/erase-user-data`, `page.tsx`,
`profile`, `systems/page`, `systems/new`, `systems/[id]/edit`,
`systems/[id]`, `tracks/page`, `tracks/[id]`, `tests/[id]` — `login` and
`register` deliberately untouched, different shell entirely).
