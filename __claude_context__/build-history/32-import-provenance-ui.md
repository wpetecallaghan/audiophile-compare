---
name: audiophile-compare-build-history-32
description: Build step 32 — Import provenance UI.
---

# ✅ 32 — Import provenance UI

**The gap this closes:** step 30 made `import_authors` publicly readable
specifically so the UI could show forum provenance — "may also help a real
forum member recognize their own imported content" — but no page actually
surfaces it. Must ship **before** the ingestion pipeline (steps 33–38)
actually runs, so imported content is never live without it. Unlike steps
30–31/33–38, this is UI work, not ingestion-pipeline infrastructure, so it
gets its full detail directly here rather than in
`build-history-ingestion/`.

**Decisions:**

1. **Reuse existing bylines; add one new one.** Three pages already render
   `by {creator?.display_name ?? t('anonymous')}` —
   `components/feed/FeedCard.tsx`, `app/tests/[id]/page.tsx`, and the
   per-test rows in `app/tracks/[id]/page.tsx`. Extend each of their
   existing `creator:users!creator_id(display_name)` queries to also
   select `is_placeholder`. `app/systems/[id]/page.tsx` currently shows no
   owner/creator information at all, to anyone — add one there for the
   first time, but scoped to only appear when the owner is a placeholder,
   so ordinary systems stay visually unchanged. This is provenance for
   imported content, not a general "add public attribution everywhere"
   change.

2. **A new `Badge` status variant, not a new component.** `components/
   ui/Badge.tsx` already has `win`/`loss`/`draw`/`blind`/`revealed`/
   `broken` — add `imported` alongside them rather than inventing a
   bespoke component for one badge.

3. **Store and link to the real forum post — this reopens already-shipped
   step 31.** New nullable column `tests.source_url text` (null for every
   web-UI-created test; populated only for imported ones). `IngestPayload`
   (`lib/ingestion/ingest-test-payload.ts`) gains an optional
   `source_url?: string`; `app/api/internal/ingest/route.ts` passes it
   through to the `ingest_test` RPC call; `ingest_test` itself needs a
   **new** migration (not an edit to the already-applied
   `20260707150400_ingest_test_function.sql`) that adds the column and
   `create or replace function public.ingest_test(...)` with the extended
   body — same signature, so `create or replace` is safe, no drop
   required. Same "new migration layers on an already-applied one"
   pattern already used for `20260707074426_cascade_delete_clips_and_
   mapping.sql` and others. Worth being explicit about: this step's value
   (a working troubleshooting link once the pipeline is live) is judged
   worth reopening shipped code for, rather than deferring the link to a
   later, separate change.

4. **The link only ever appears alongside the badge**, not as a
   standalone general-purpose link on every test — it's contextual to "this
   was imported." Uses the existing `Link` component (`variant="inline"`)
   with `target="_blank" rel="noopener noreferrer"`; `Link` already wraps
   `next/link`, which renders a plain anchor for an absolute URL, so no new
   link-handling code is needed.

5. **Copy lives in the `common` i18n namespace** (currently just
   `cancel`/`networkError`) — shared across the systems/tests/tracks/feed
   namespaces, so it doesn't belong to just one of them. New keys: the
   badge label and the link text (e.g. "View original post").

6. **Forward-compatible with the not-yet-planned claim step, for free.**
   `is_placeholder` flips to `false` once a future claim reassigns
   ownership and deletes the placeholder row — the badge and link
   disappear automatically; no extra logic needed here or in that later
   step.

7. **The scraper/extraction steps (33/34) need to actually populate
   `source_url`.** Step 33 (scraper) already plans to capture each post's
   real `post_url`; step 35 (extraction) needs to carry the *specific
   pair's* post URL into the candidate's `source_url` field. This is a
   plan update to `build-history-ingestion/`, not new code, since those
   steps aren't built yet.

8. **Addendum (from step 39's design): a contact link next to the badge,
   so provenance actually leads somewhere.** Something like "Think this is
   yours? [contact email]" alongside the "View original post" link —
   otherwise this step shows *who* imported content belongs to with no way
   for that person to act on it. A static mailto/contact string, not a new
   form or claim-request flow — step 39 (`build-history-ingestion/39-claim-flow.md`)
   handles verification and the actual merge from there.

**Files updated:**
- `supabase/migrations/20260707173905_tests_source_url.sql` (new) —
  `alter table public.tests add column source_url text;` plus
  `create or replace function public.ingest_test(...)` extended to store
  `payload->>'source_url'`, re-affirming the EXECUTE lockdown from step 31.
  Layered on top of the already-applied `20260707150400_...` migration, not
  an edit to it. Applied to both staging and production (step 37 ran the
  real import against both).
- `lib/ingestion/ingest-test-payload.ts` — `IngestPayload.source_url?:
  string`.
- `app/api/internal/ingest/route.ts` — passes `source_url` through to the
  RPC payload.
- `lib/ingestion/__tests__/ingest-test-payload.test.ts` — new case
  covering the optional field.
- `app/api/internal/ingest/__tests__/route.integration.test.ts` — extended
  to assert `source_url` round-trips onto the created `tests` row.
- `components/ui/Badge.tsx` — new `imported` (purple) status variant.
- `messages/en.json` — new `common` namespace keys: `importedBadge`,
  `viewOriginalPost`, `claimContact` (reuses the existing contact address
  already hardcoded in the privacy/terms pages).
- `components/feed/FeedCard.tsx` + `app/page.tsx` — extended the creator
  query with `is_placeholder`; badge only (no links — the whole card is
  already a `<Link>`, so a nested link isn't valid HTML).
- `app/tests/[id]/page.tsx` — extended the query with `source_url` and
  `creator.is_placeholder`; full treatment (badge + "view original post"
  link, shown only when `source_url` is present + claim-contact text).
- `app/tracks/[id]/page.tsx` — extended the query with
  `creator.is_placeholder`; badge only, same reasoning as `FeedCard`.
- `app/systems/[id]/page.tsx` — added an `owner:users!owner_id(is_placeholder)`
  join (this page previously showed no owner information at all) and a
  conditional badge + claim-contact line — no "view original post" link,
  since systems have no `source_url` of their own.
- `e2e/helpers/admin.ts` — `seedSystem`/`seedTrack`/`seedTest` gained
  optional owner/creator-id (and `seedTest` a `source_url`) parameters,
  defaulting to the existing real-test-user behavior; new
  `seedPlaceholderOwnedTest` helper exercises the real
  `create-placeholder-author.ts` to seed a placeholder-owned fixture.
- `e2e/global-teardown.ts` — extended with a second sweep matching
  `[E2E]`-prefixed content by `is_placeholder` ownership, since the
  original sweep only matched the one specific real test-user id and
  would otherwise miss placeholder-owned fixtures entirely.
- `e2e/tests/import-provenance.spec.ts` (new).
- `__claude_context__/components.md` — the new Badge variant and the
  conditional-provenance pattern, including why compact rows get badge-only.
- `__claude_context__/audiophile-compare-schema.md` — `tests.source_url`
  column; `ingest_test` section updated; corrected a stale "not yet
  implemented" cross-reference for the claim flow to point at step 39.
- `__claude_context__/api-conventions.md` §5 — noted `IngestPayload.
  source_url`.
- `__claude_context__/testing.md` — new unit-test row and count, new E2E
  spec row, and a note on placeholder-owned fixtures needing the second
  teardown sweep.
- `__claude_context__/core.md` — build status line.

**Verified:**
- `npm run test` — 27 files / 292 tests, all passing (1 new case in
  `ingest-test-payload.test.ts`). `npx tsc --noEmit` — no new errors (same
  pre-existing, unrelated `__tests__/supabase-*.test.ts` failures as every
  prior step).
- **EXECUTE lockdown re-confirmed directly against staging with the anon
  key after the `create or replace`:** `POST .../rest/v1/rpc/ingest_test`
  → `401`, `"permission denied for function ingest_test"` — the
  lockdown survives a function replacement, as expected, but worth
  re-checking rather than assuming.
- **`npm run test:integration` — 5/5 passing against staging**, including
  the new assertion that a payload's `source_url` round-trips onto the
  created `tests` row.
- **Full Playwright suite run locally (48/48 passing)**, not just the 5
  new `import-provenance.spec.ts` cases — confirms no regression in any
  existing spec from the query/schema changes. Caught and fixed one real
  bug during this run: the first version of the feed/track-row assertions
  built a `RegExp` directly from a fixture title containing literal
  `[E2E]` brackets, which are regex metacharacters — silently matched
  nothing rather than erroring. Fixed by scoping via `page.locator('li',
  { hasText })` (plain substring matching) instead of a role-name regex.
