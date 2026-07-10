---
name: audiophile-compare-build-history-44
description: Build step 44 — Keep the "view original post" link after a claim.
---

# ✅ 44 — Keep the "view original post" link after a claim

**The gap this closes:** step 32 added, on the test detail page, an
"Imported" badge + a "view original post" link (`tests.source_url`) + a
static claim-contact string, all three gated by one single condition:
`creator?.is_placeholder`. Step 39's claim flow (`claim_placeholder`)
reassigns `tests.creator_id` to the real, now-registered user and deletes
the placeholder identity — `creator.is_placeholder` correctly becomes
`false` at that point, but `tests.source_url` itself is untouched by the
claim migration (confirmed by reading
`supabase/migrations/20260709145657_claim_placeholder.sql` — it reassigns
`systems.owner_id`/`tests.creator_id`/`tracks.created_by`/
`comments.user_id`/`votes.user_id` and repoints `import_authors.user_id`,
never `tests.source_url`). Because all three pieces shared one condition,
claiming a test correctly hid the badge and the claim-contact prompt (right
— there's no one left to claim it) but also hid the "view original post"
link, discarding a still-valid, still-useful piece of provenance.

**Confirmed this is the only affected render site:** grepped every
`viewOriginalPost`/`source_url` reference in `app/`/`components/` — the
link only ever renders in `app/tests/[id]/page.tsx`. `FeedCard.tsx` and
`app/tracks/[id]/page.tsx` show the badge only, never the link (they're
already whole-card `<Link>`s to the test's own detail page, so a nested
link isn't valid HTML there — per `components.md`'s own existing note). No
other page needed a change.

**Decisions:**

1. **Split the single `creator?.is_placeholder` condition into two
   independent ones**, keeping the existing single wrapping `<p>` (now
   rendered if either is true, so it's never left empty): the "view
   original post" link gates on `test.source_url` alone (already `null`
   for a web-wizard-created test, so this can't newly leak a link on
   ordinary content); the claim-contact string stays gated on
   `creator?.is_placeholder`, unchanged — once claimed there's no
   placeholder identity left to claim, so continuing to prompt "think this
   is yours, contact ... to claim it" would be actively wrong, not just
   extra.
2. **The "Imported" badge is deliberately out of scope, unchanged.** The
   badge's established meaning ("forum-ingested content, not yet claimed by
   a real user") is still correct to hide once claimed — the content is now
   normally-owned. A separate "originally imported" signal that survives a
   claim would be a new, separate decision, not implied by this one.
3. **Test fixture: reproduce the post-claim shape directly rather than
   actually calling `claim_placeholder`.** A real claim deletes the
   placeholder's `public.users` row and permanently repoints its
   `import_authors` mapping to the real user — exercising the real RPC per
   test run would accumulate one orphaned `import_authors` row forever,
   with no cleanup path (claiming is by design irreversible-in-place).
   Unnecessary here since this UI only cares about the resulting
   `is_placeholder`/`source_url` shape, not the mechanism that produced it
   — `claim_placeholder` already has its own dedicated integration test
   (`app/api/admin/claim/__tests__/route.integration.test.ts`). New
   `seedClaimedTest` helper reuses `seedTest`'s existing `creatorId`/
   `sourceUrl` params directly: a normal, `E2E_TEST_USER_EMAIL`-owned test
   with a `source_url` set — exactly what a claimed test looks like,
   without ever creating a placeholder identity, so it's covered by the
   ordinary teardown sweep like any other fixture, no special handling
   needed the way `seedPlaceholderOwnedTest` requires.

**Files updated:**
- `app/tests/[id]/page.tsx` — the combined `creator?.is_placeholder` block
  split into two independently-gated pieces inside one wrapping `<p>`.
- `e2e/helpers/admin.ts` — new `seedClaimedTest(suffix)`.
- `e2e/tests/import-provenance.spec.ts` — new case; the existing unclaimed
  and ordinarily-owned cases are untouched, genuinely different scenarios.
- `__claude_context__/components.md` — updated the import-provenance
  section to describe the split condition instead of "two links when
  placeholder-owned."
- `__claude_context__/testing.md` — updated the `import-provenance.spec.ts`
  inventory row; added a short note on why `seedClaimedTest` doesn't need
  `seedPlaceholderOwnedTest`'s special teardown handling.
- `__claude_context__/build-history/index.md` — new row 44.

**Tests:** covered inline above — one new E2E case, no unit tests (this is
a single JSX conditional in a Server Component page with no unit-test
coverage today, same convention noted in `testing.md §1` for this whole
file; verified by E2E as usual).

**Verified:** `npx tsc --noEmit` — no new errors (same pre-existing,
unrelated `__tests__/supabase-*.test.ts` failures as every prior step). `npx
playwright test e2e/tests/import-provenance.spec.ts` — run against a local
dev server (`E2E_BASE_URL=http://localhost:3000`, pointed at the same
staging Supabase project via the ambient `.env.local` credentials, not the
deployed staging site — same deployment-lag reason steps 23/26/27/40/43 all
ran E2E locally) — 6/6 passing, including the new claimed-test case
confirming the link survives while the badge and claim-contact text
correctly stay hidden.
