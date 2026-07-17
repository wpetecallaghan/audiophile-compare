---
name: audiophile-compare-build-history-65
description: Build step 65 — Show snapshot info next to Before/After clip labels in MappingBadge.
---

# ✅ 65 — Show snapshot info next to Before/After clip labels

**The gap this closes:** once a test is revealed, `MappingBadge` told a
viewer "Clip A: Before" / "Clip B: After" but never *which system/snapshot*
was before and which was after. That pairing already existed in the data —
clip A always corresponds to `snapshot_a_id`, clip B to `snapshot_b_id`, a
documented invariant across all three test-creation paths (the web wizard's
`POST /api/tests`, `POST /api/tests/cross-check`'s own comment "clip_a
corresponds to snapshot_a_id; clip_b to snapshot_b_id", and the ingestion
pipeline's `ingest_test` SQL function) — but it was never rendered next to
the Before/After label itself.

**Decisions:**

1. **No new gating logic needed.** `MappingBadge` only ever renders when
   `isRevealed && mapping` is true (`app/tests/[id]/page.tsx`), and
   `canSeeSystemInfo = isRevealed || isCreator` (step 43) is therefore always
   `true` at that point for every viewer, not just the creator — so the
   page's existing, already-redacted `snapshotA`/`snapshotB` values are
   passed straight into `MappingBadge` with no additional check.

2. **`formatOneSnapshot` (`lib/tests/format-snapshot-line.ts`) is now
   exported**, not just used internally by `formatSnapshotLine`. `MappingBadge`
   needs to format one side at a time — `formatSnapshotLine`'s "A vs B" join
   isn't the shape it needs.

3. **Header's `snapshotLine` is hidden once revealed** — a real duplication
   problem, not just a cosmetic one. Before this step, the page header
   rendered `formatSnapshotLine(snapshotA, snapshotB)` (e.g. "SystemX · v2
   vs SystemY · v3") unconditionally whenever `canSeeSystemInfo` was true.
   Once `MappingBadge` also renders each side's "`SystemName · label`" text,
   that string would appear twice on the page — and since Playwright's
   `getByText` matches by substring, both the header line and the badge's
   per-clip line match the same locator, which would have broken
   `e2e/tests/voting.spec.ts`'s existing "after reveal: system/snapshot info
   is visible to a non-creator too" test (strict-mode violation: 2 matches
   where it expects 1). Fixed by gating the header's `snapshotLine` on
   `!isRevealed` — it stays exactly as before for a creator viewing their
   own still-blind test (the one case where `MappingBadge` isn't rendered
   yet and this line is the sole source of that info), and disappears once
   revealed, since `MappingBadge` becomes the single, more precise
   (before/after-tied, not just an unordered pairing) place this information
   lives.

4. **Rendered outside the unsupported-clip `<a>` wrapper.** `MappingBadge`
   already turns a clip's Before/After text into a link
   (`clipAUnsupportedUrl`/`clipBUnsupportedUrl`, step 28) when that clip
   can't be embedded. The new snapshot summary line is a sibling `<p>`
   underneath, not nested inside that link — so
   `e2e/tests/clip-health.spec.ts`'s existing assertion that the link's own
   text content is just `/before|after/i` stays valid unchanged.

**Files updated:**
- `lib/tests/format-snapshot-line.ts` — `formatOneSnapshot` exported; header
  comment updated to name `MappingBadge` as a third caller.
- `components/tests/MappingBadge.tsx` — two new optional props,
  `snapshotA`/`snapshotB` (type `SnapshotSummary`, default `null`, same style
  as the existing `clipAUnsupportedUrl`/`clipBUnsupportedUrl`); renders
  `formatOneSnapshot(...)` as a muted `text-xs` line under each clip's
  Before/After text.
- `app/tests/[id]/page.tsx` — passes `snapshotA`/`snapshotB` (already
  computed, already `canSeeSystemInfo`-redacted) into `<MappingBadge>`;
  `snapshotLine` render gated on `!isRevealed`.
- `lib/tests/__tests__/format-snapshot-line.test.ts` — 3 new cases for the
  now-exported `formatOneSnapshot`.
- `components/tests/__tests__/MappingBadge.test.tsx` — **new file**, 5 tests.
- `e2e/tests/voting.spec.ts` — comment updated on the "after reveal ...
  visible to a non-creator too" test explaining the assertions now read
  `MappingBadge`'s text, not the (now-hidden-once-revealed) header line; no
  assertion text changed, since both use the same `formatOneSnapshot` format.

**Tests:**
- `components/tests/__tests__/MappingBadge.test.tsx` (new): Before/After
  labeling per `clipAId === beforeClipId` (both directions); each side's
  snapshot summary renders next to its label; summary line omitted when a
  snapshot is `null`; the unsupported-clip link's own text stays just
  "Before"/"After", not the snapshot summary.
- `lib/tests/__tests__/format-snapshot-line.test.ts`: `formatOneSnapshot`
  formats a single snapshot, falls back to `'?'` with no joined system,
  returns `null` for a `null` snapshot.
- `e2e/tests/voting.spec.ts`'s existing "after reveal: system/snapshot info
  is visible to a non-creator too" test continues to pass — now exercising
  `MappingBadge`'s rendering instead of the hidden header line.

**Verified:**
- `npm test` — 55 files / 567 tests, all passing.
- `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step).
- E2E not re-run against staging as part of this step (no staging
  deployment yet carrying this change) — `voting.spec.ts` and
  `clip-health.spec.ts` were read through in full to confirm neither
  depends on the removed header line in a way this step doesn't already
  account for; run `npx playwright test e2e/tests/voting.spec.ts
  e2e/tests/clip-health.spec.ts` against a deployed build before merging to
  confirm for real.
