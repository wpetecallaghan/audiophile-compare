---
name: audiophile-compare-build-history-67
description: Build step 67 — Tidy revealed-test information architecture in MappingBadge.
---

# ✅ 67 — Tidy revealed-test information architecture in MappingBadge

**The gap this closes:** step 65 added each clip's real system/snapshot text
under its Before/After label in `MappingBadge`. That surfaced two
redundancies once both pieces of information were on screen at once:

1. **"Revealed" was shown twice.** `app/tests/[id]/page.tsx`'s own status
   eyebrow (`{isRevealed ? t('revealedStatus') : t('blindStatus')}`,
   ~line 277) already says "Revealed" once, directly above. `MappingBadge`
   repeated the identical English string via a second i18n key
   (`tests.mapping.revealedBadge`). Confirmed by grep this was the only
   other "Revealed" text on the page.
2. **"Before"/"After" duplicated what the snapshot text already said.**
   Once a clip's real `SystemName · label` renders right under its
   Before/After word, the explicit word is extra ceremony — the snapshot's
   own label is doing the identifying work.

**Decisions:**

1. **Both removed outright, not reworded.** `MappingBadge` now renders just
   `Clip A`/`Clip B` plus each side's snapshot text — no heading, no
   Before/After wording.

2. **`clipAId`/`beforeClipId`/`afterClipId` props deleted, not just the
   text that used them.** They existed solely to compute `aIsBefore =
   clipAId === beforeClipId`, which picked which of "Before"/"After" to
   render. With that logic gone, the props were dead weight, not just
   unused strings — removed from both `MappingBadge`'s `Props` type and its
   one call site (`app/tests/[id]/page.tsx`). `mapping` (the `clip_mapping`
   fetch) is otherwise unchanged — it still gates whether `MappingBadge`/
   `hideClipA`/`hideClipB` render at all (`isRevealed && mapping`), it just
   no longer feeds values into this component.

3. **Unsupported-clip link reuses the existing `tests.openClipLink`
   ("Open link directly") copy**, rather than inventing new copy for the
   link text that used to be the Before/After word. This is the same string
   `MediaPlayer`/`UnknownPlayer` already use for the identical "can't embed,
   here's a raw link" case elsewhere (`components.md §5`) — applying the
   repeated-string-constants directive by reusing an existing key instead of
   duplicating its meaning under a new one. Required a second,
   root-level `useTranslations('tests')` hook alongside the existing
   `tests.mapping`-scoped one, the same multi-scope-hook-in-one-component
   pattern `app/tests/[id]/page.tsx` already uses for `t`/`tCommon`/
   `tForumLink`.

4. **`messages/en.json` cleanup**: `tests.mapping.revealedBadge`,
   `tests.mapping.before`, `tests.mapping.after` deleted — confirmed via
   grep that `MappingBadge.tsx` was their only reader anywhere in the
   codebase. `tests.mapping.clipALabel`/`clipBLabel` kept (still rendered);
   `tests.openClipLink` kept, unchanged, now with a second reader.

**Files updated:**
- `components/tests/MappingBadge.tsx` — `Props` shrinks from 7 fields to 4;
  heading `<p>` deleted; `aIsBefore`/`clipALabelText`/`clipBLabelText`
  deleted; unsupported-clip link now renders `tests('openClipLink')`.
- `app/tests/[id]/page.tsx` — `<MappingBadge>` call site drops
  `clipAId`/`beforeClipId`/`afterClipId`; two stale comments referencing the
  old Before/After-tied wording corrected (the `hideClipA`/`hideClipB`
  comment near the `canShowMappingLinks` definition, and the header
  `snapshotLine` comment).
- `messages/en.json` — 3 orphaned keys removed under `tests.mapping`.
- `components/tests/__tests__/MappingBadge.test.tsx` — rewritten: no more
  Before/After-direction cases (nothing left to test there); new cases
  confirm both clip labels render with no "Revealed"/"Before"/"After" text
  anywhere in the component, each side's snapshot summary renders under its
  label (and is omitted when `null`), the unsupported-clip link renders
  "Open link directly" with the correct `href`, and a supported clip (no
  `...UnsupportedUrl`) renders no link at all.
- `e2e/tests/clip-health.spec.ts` — the "revealed view: the mapping badge's
  ... links directly to the clip" test renamed (no more "Before/After
  label" in its name) and its link-text assertion changed from
  `/before|after/i` to `m.tests.openClipLink`; its own `.first()` on the
  `revealedStatus` check dropped (only one exact match remains on the page)
  and the comment explaining why rewritten.
- `e2e/tests/voting.spec.ts` — three separate `.first()` calls on the same
  `revealedStatus` exact-text check, all justified (directly or by
  cross-reference) by "MappingBadge's own 'Revealed' label is a second
  legitimate exact match" — all three `.first()`s dropped, and the
  reasoning comments (on the `'creator can reveal the test'` and `'after
  reveal: system/snapshot info is visible to a non-creator too'` tests)
  corrected to match the new reality.

**Tests:**
- `components/tests/__tests__/MappingBadge.test.tsx` (rewritten, 5 tests):
  see above.
- `e2e/tests/clip-health.spec.ts`'s renamed/updated test, and
  `e2e/tests/voting.spec.ts`'s three updated `revealedStatus` assertions —
  both run against a real local dev server, not just asserted to compile.

**Verified:**
- `npm test` — 55 files / 567 tests, all passing.
- `npx tsc --noEmit` — no new errors (confirms the trimmed `Props` type
  matches the page's call site with no stale prop on either side; a
  mismatch here would have been a compile error, not a silent bug).
- `npx playwright test e2e/tests/clip-health.spec.ts e2e/tests/voting.spec.ts`
  — 16/16 passing against a local dev server (this run also happened to
  re-run two tests that had flaked on unrelated staging-propagation lag in
  step 66's verification pass — clean this time, confirming that flake was
  never related to this component).
