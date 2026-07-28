---
name: audiophile-compare-build-history-88
description: Build step 88 — A third color/class-fragment audit (via /audit), scoped to raw literals duplicating an established token or repeating verbatim within/across files.
---

# ✅ 88 — Third color audit: 2 token-alignment fixes, 6 repeated-fragment extractions

**The request, reported directly:** ran via the project's `/audit` skill
against `repeated-string-constants.md`'s "colors / CSS class fragments"
category — a third pass on the same problem steps 83 and 84 already
worked. Full-repo ripgrep sweep (excluding `__tests__/`, `e2e/`, and the
token-definition files themselves) confirmed via `git log` that this
category hadn't been swept since step 84.

**Audit findings:** 9 items across 8 files.

**A. Raw literal duplicates an already-established token exactly:**
1. `app/tests/[id]/page.tsx`'s `ClipSlotFallback` — `bg-gray-100
   dark:bg-gray-800` → `bg-divider` (same shade step 84 already tokenized
   for the chip role; this call site had been missed).
2. `components/ui/Callout.tsx`'s `neutral` tone — `bg-gray-50
   dark:bg-gray-800` → `bg-hover-surface` (exact match to step 84's
   hover-surface token value; reused rather than adding a near-duplicate).

**B. Same class-string repeats within one file → local `const`:**
3. `components/tests/MappingBadge.tsx` — two consts:
   `SNAPSHOT_TEXT_CLASSES` (`'text-xs text-blue-700/80
   dark:text-blue-300/80 mt-0.5'`, the two snapshot-label `<p>`s) and
   `CLIP_LINK_CLASSES` (`'ml-2 text-link underline'`, the two "open clip
   link" `<a>`s).
4. `components/systems/SnapshotSection.tsx` — `VERSION_CHIP_CLASSES`
   (`'font-mono bg-divider px-1.5 py-0.5 rounded'`), edit-mode and
   display-mode version chips.
5. `components/tests/CrossCheckSelector.tsx` — `PROVIDER_CHIP_CLASSES`
   (`'bg-divider rounded px-1.5 py-0.5'`), the two provider/media-type
   chips per row.
6. `components/tests/TallyDisplay.tsx` — `OBSERVATION_TEXT_CLASSES`
   (`'text-sm text-body'`), the two observation-list `<li>`s.

**C. Same class-string repeats across files → new shared module
`components/ui/class-names.ts`:**
7. `MUTED_CAPTION_CLASSES` (`'text-xs text-muted'`) — replaces the raw
   literal in `app/systems/[id]/page.tsx`, `app/systems/[id]/edit/page.tsx`,
   `app/tracks/[id]/page.tsx` (breadcrumb `<nav>`s),
   `components/systems/SnapshotSection.tsx` (`<li>`), and
   `components/ui/Divider.tsx` (`<span>`). Not routed through the existing
   `<Text>` component: `Text`'s `as` prop only supports `'p' | 'span'`, and
   4 of the 5 call sites are `<nav>`/`<li>` — mixing "`Text` here, raw class
   there" for the identical literal would be less consistent than one
   shared constant everywhere.
8. `SPINNER_CLASSES` (`'h-6 w-6 animate-spin text-muted'`) — replaces the
   raw literal in `components/ui/PageLoading.tsx` and
   `app/tests/[id]/page.tsx`'s `ClipSlotFallback`.

**Reviewed, left as-is** (single occurrence per shade, or already using its
token correctly — per `repeated-string-constants.md`'s "don't over-apply"):
`Badge.tsx`'s per-status palette (enumerated variants, same as step 84's
`Callout` tones), `ConfirmButton.tsx`'s amber family (distinct per-state
action colors, no exact duplicate elsewhere), `Button.tsx`'s inverse-hover
gray (single occurrence, different mechanic from `hover-surface`),
`TextField.tsx`'s single dark-only bg, `TallyDisplay.tsx`'s progress-bar
fill and `<h3>` heading color (single occurrence each, don't exactly match
an established token pair), `SiteHeader.tsx`'s hover text (single
occurrence, mismatched shade pair), and `app/profile/page.tsx`'s 3×
`<hr className="border-divider" />` (already using the token; the
one-word literal repeating three times in one file is too low-value to
extract further).

**Fix:** see items 1-8 above; no `app/globals.css` or `tailwind.config.ts`
changes needed this time — both token-alignment fixes reused tokens step 84
already defined.

**Docs:** this file; `build-history/index.md` gains an entry.

**Tests:** no existing test asserted on any of the literals replaced here
(checked via grep before editing) — none needed updating. No new test
files needed; this is a pure class-attribute refactor with the same
rendered visual result.

**Verified:**
- `npm test` — 611/611 passing across 62 files, same count as before this
  step (no test touched any of this step's files).
- `npm run build` — clean, no TypeScript errors.
- Ripgrep re-run of every literal from A/B/C confirmed zero remaining raw
  occurrences outside their new constant declarations.
- Browser-verified via Playwright against the local dev server (light +
  dark, `colorScheme` emulation), zero console/page errors in every case:
  `/login` (exercises `Divider` → `MUTED_CAPTION_CLASSES`, the same
  constant-substitution pattern as items 3-8), and an authenticated,
  revealed test-detail page reached via `e2e/helpers/auth.ts`'s
  `createAuthenticatedContext` (exercises `MappingBadge`'s
  `SNAPSHOT_TEXT_CLASSES`/`CLIP_LINK_CLASSES` directly, confirming the
  info-callout snapshot labels and clip links render identically to
  before).
