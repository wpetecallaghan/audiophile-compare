---
name: audiophile-compare-build-history-47
description: Build step 47 — "Imported" badge survives a claim.
---

# ✅ 47 — "Imported" badge survives a claim

**The gap this closes:** step 44 deliberately kept the "Imported" badge
tied to `creator?.is_placeholder` while making the "view original post"
link survive a claim independently — reasoning at the time that "the
badge's established meaning ('forum-ingested content, not yet claimed by
a real user') is still correct to hide once claimed," and explicitly
flagging that a badge surviving a claim would be "a new, separate
decision, not implied by this one." This step is that decision: the badge
should always show for a test that was ever imported, regardless of
current ownership.

**No schema/RLS change — pure application-layer fix.** `tests` already has
two columns that reliably signal "this came from ingestion" and are never
touched by `claim_placeholder` (confirmed by reading its current body — it
only reassigns `creator_id`/`owner_id`/etc. and repoints `import_authors`,
never `source_url`/`source_ref`):
- `source_ref` — the ingestion idempotency key, always set by
  `POST /api/internal/ingest` (required field), never by the web wizard.
- `source_url` — the forum post URL, same origin story, also never set
  by the web wizard (confirmed: `POST /api/tests`'s `CreateTestBody` has
  no such field, only the unrelated `forum_link` from step 46).

**Decisions:**

1. **`isImported = !!(source_url || source_ref)`, OR'd, not just one.**
   `source_url` alone is documented as null for any import predating that
   column. `source_ref` alone would break the existing E2E fixture —
   `seedPlaceholderOwnedTest` sets `source_url` but never `source_ref`.
   Together they cover every real case (current e2e fixtures, all real
   production imports, any theoretical legacy row) with zero fixture
   changes needed.
2. **Scope: "imported test" per the request — not systems.** The systems
   page has its own, separate "Imported" badge for a *system's* current
   owner, gated on that owner's live `is_placeholder`. There's no
   equivalent "this system was originally created under a placeholder
   identity" persistent signal without new schema, and none was asked
   for — left untouched, asymmetry documented explicitly in
   `components.md` so it doesn't read as an inconsistency to "fix" later.
3. **Also fixed, not explicitly named: the per-test rows on the track
   detail page** (`app/tracks/[id]/page.tsx`) — the third of three sites
   this exact test badge already appears on. Leaving it inconsistent with
   the feed and test detail page would just be a new gap in the other
   direction.
4. **Claim-contact stays exactly as it was (`is_placeholder`-only) — not
   touched.** Once claimed there's genuinely no placeholder identity left
   to contact about; only the badge's *meaning* changes ("this content
   was imported," a permanent fact) not the claim-contact's ("here's who
   to contact to claim it," which stops applying).
5. **`creator.is_placeholder` removed from the three changed queries/types
   where it became unused** (`FeedCard.tsx`'s `FeedTest`, `app/page.tsx`'s
   feed query, `app/tracks/[id]/page.tsx`'s `TestRow`) — each only ever
   read it for this one badge check; leaving it selected but unread would
   be dead weight.

**Files updated:**
- `app/tests/[id]/page.tsx` — added `source_ref` to the existing query
  (already had `source_url`); new `isImported` computed alongside the
  existing `isCreator`/`isRevealed`/`canSeeSystemInfo` booleans; badge
  condition switched from `creator?.is_placeholder` to `isImported`.
  Claim-contact and the "view original post" link untouched.
- `app/page.tsx` — added `source_url, source_ref` to the feed query;
  dropped `is_placeholder` from the `creator` join; per-row `is_imported`
  computed in the existing `tests.map(...)` block (same place step 43's
  `canSeeSystemInfo` is computed) and added to the `FeedTest` object.
- `components/feed/FeedCard.tsx` — `FeedTest.creator` type drops
  `is_placeholder`; new `is_imported: boolean` field; badge condition
  switched from `test.creator?.is_placeholder` to `test.is_imported`.
- `app/tracks/[id]/page.tsx` — added `source_url, source_ref` to the
  nested `tests(...)` select; dropped `is_placeholder` from `TestRow`'s
  `creator` type; `isImported` computed per row in the existing render
  map; badge condition switched.
- Docs: `components.md` (badge section rewritten to document the
  test-vs-system asymmetry explicitly), `audiophile-compare-schema.md`
  (extended the step 46 `forum_link`-vs-`source_url` note with the badge's
  new `source_url`/`source_ref` rule), `testing.md` (E2E inventory row),
  `entry.md`/`core.md` (step count).

**Tests:** updated, not added — `e2e/tests/import-provenance.spec.ts`'s
existing `'claimed test'` case directly asserted the behavior this step
reverses (badge `not.toBeVisible()` on a claimed test). Renamed to step 47
and flipped that one assertion to `toBeVisible()`; claim-contact assertion
unchanged. `seedClaimedTest` (built in step 44 specifically to reproduce
"real creator + `source_url` set" without touching the real claim RPC) was
exactly the right existing fixture — no new helper needed. The other four
cases in the file are unaffected and needed no changes: the three
unclaimed-placeholder-owned-content cases because `isImported` is still
true for them (their `source_url` was never cleared, just now also
independently sufficient without `is_placeholder`), the
ordinarily-owned-test case because `seedCompleteTest` never sets
`source_url`/`source_ref` at all, and the system-detail-page case because
it's the deliberately out-of-scope systems badge.

No unit tests — none of the three changed files has unit coverage today
(all server components/pages, E2E-only, per `testing.md §1`'s established
convention for this whole area).

**Verified:**
- `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step).
- `npm run test` — 39 files / 452 tests, all passing, unaffected (no unit
  tests touch these files).
- `npx playwright test e2e/tests/import-provenance.spec.ts` — run against
  a local dev server (`E2E_BASE_URL=http://localhost:3000`, not deployed
  staging, same deployment-lag reason every recent step has used) — 6/6
  passing on the first run, including the flipped claimed-test assertion.
- Full local E2E suite (`npx playwright test`, all spec files) — 60/60
  passing, confirming no regressions from removing `is_placeholder` off
  the three changed queries.
