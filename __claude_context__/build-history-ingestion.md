---
name: audiophile-compare-build-history-ingestion
description: >
  Detailed step-by-step build plan for the Lejonklou forum ingestion
  pipeline (build-history.md steps 30, 31, 33, 35-39). Companion to
  build-history.md (which holds only short pointer entries for these
  steps, to keep the main index scannable) and deferred-features.md
  (original architecture notes and rationale — the "why", not the "how").
  Steps 32 and 34 (import provenance UI; Google Drive clip provider
  support) are UI/core-app work, not pipeline infrastructure — both are
  fully detailed directly in build-history.md instead. Load this when
  working on any forum-ingestion build step.
---

# Forum Ingestion Pipeline — Detailed Build Plan

Full detail for `build-history.md` steps 30, 31, 33, and 35–39 (steps 32
and 34 — import provenance UI, Google Drive provider support — are
detailed directly in `build-history.md` instead — see above). See
`deferred-features.md`'s
"Forum ingestion pipeline" section for the original architecture notes this
plan builds on and, in one place, deliberately diverges from — the original
doc assumed a single `ingestion_bot` user owns everything imported; this plan
instead attributes imports to a per-forum-author placeholder identity, so a
later merge step (explicitly deferred — see the bottom of this file) can hand
real people their own content.

---

## ✅ 30 — Placeholder author infrastructure

**The gap this closed:** nothing today can represent "a Lejonklou forum user
who hasn't joined the app yet" as a content owner. `systems.owner_id`,
`tests.creator_id`, and `tracks.created_by` are all `NOT NULL` references to
`public.users(id)`, which only exists via the `handle_new_user` trigger firing
on a real `auth.users` insert.

**Decisions:**

1. **A full, real `auth.users` row per forum author — not a nullable-owner
   schema change.** Reuses the entire existing ownership/RLS model
   unchanged: systems/tests/tracks owned by a placeholder look exactly like
   ones owned by a real user everywhere in the app (profile pages, edit/
   delete checks, RLS policies). The alternative (nullable `owner_id` +
   an "unclaimed" state) would require schema and RLS changes across
   `systems`/`tests`/`tracks` *before* ingestion ever runs once, for a state
   that's only supposed to be temporary. Rejected for that reason.

2. **New `public.users.is_placeholder boolean not null default false`
   column.** Lets the future merge step query "who's still unclaimed" and
   lets the UI show "(imported)" next to a display name. Migration only —
   **no RLS policy needed**: nothing reads/writes this column through a
   normal user session; it's only ever set by the ingest route's admin
   client (step 31), which bypasses RLS entirely, same as the step-10 cron.
   (This project has hit the "forgot an RLS policy for a new write path"
   bug twice now — steps 26 and 27 — so it's worth stating explicitly *why*
   this one doesn't need one, not just that it doesn't.)

3. **Placeholder email: `<slug>@import.audiophile-compare.uk`** — a
   subdomain of the domain already used for the privacy policy/terms
   pages. No DNS/MX records needed; nothing ever sends real mail to it,
   since these rows are inserted directly with `email_confirmed_at` set at
   insert time (mirroring the existing `ingestion_bot` precedent of being
   "created manually in `auth.users`" — see `deferred-features.md`).
   Chosen over a `+subaddress` of a personal Gmail (the original
   suggestion) to avoid permanently tying dozens of bot identities to a
   real personal inbox.

4. **Slugification rule** for turning an arbitrary forum username into a
   valid, collision-safe email local-part: lowercase; strip to
   `[a-z0-9-]`; collapse repeated `-`; truncate to 40 chars; on collision
   with an existing placeholder email, append `-2`, `-3`, etc. (query
   existing `@import.audiophile-compare.uk` addresses first).

5. **Reuse the existing `handle_new_user` trigger unmodified.** Insert the
   placeholder's `auth.users` row with
   `raw_user_meta_data: {"full_name": "<forum display name>"}` —
   the trigger already coalesces `full_name` into `display_name` (added in
   step 14 for Google OAuth), so the correct `public.users` row is created
   automatically. `is_placeholder` is set in a small follow-up `UPDATE`
   right after (via the admin client) rather than teaching the trigger
   about it — keeps a working, load-bearing trigger untouched for a
   feature-specific flag.

6. **Resolved: the `forum_username → placeholder user_id` mapping lives in
   a new `public.import_authors` table, not a derived/reconstructed email
   lookup.** The alternative (recompute the expected placeholder email
   from a deterministic slug of the username, look it up by email) doesn't
   actually work on inspection: slugification is lossy (case/unicode/
   punctuation stripped) and collision resolution is order-dependent (the
   *n*th colliding username gets a `-n` suffix at creation time) — so
   resolving a raw username back to "was this the 1st, 2nd, 3rd... colliding
   registration" isn't recoverable from the email string alone. An explicit
   table sidesteps this by keying on the *raw, unmodified* username directly:
   ```sql
   create table public.import_authors (
     id                 uuid primary key default gen_random_uuid(),
     source             text not null,              -- e.g. 'lejonklou-forum' — future-proofs other forums later
     external_username  text not null,               -- raw, unmodified — not the lossy slug
     user_id            uuid not null references public.users(id) on delete cascade,
     created_at         timestamptz default now(),
     unique (source, external_username)
   );

   alter table public.import_authors enable row level security;

   create policy "import_authors: public read"
     on public.import_authors for select using (true);
   -- No insert/update/delete policy — only ever written via the
   -- admin/service-role client (ingest route, future merge step),
   -- which bypasses RLS entirely.
   ```
   **Public read, decided deliberately:** lets the UI show provenance (e.g.
   "imported from the Lejonklou forum" on a system/test page), which may
   also help a real forum member recognize their own imported content and
   be more inclined to register and claim it. This doesn't newly expose the
   username itself — that's already public via `display_name` regardless
   (decision 5) — it only additionally reveals *which* forum it came from.

   **Repointed, not deleted, at merge time.** The future merge step should
   `UPDATE import_authors SET user_id = :real_user_id` rather than discard
   the row — this preserves "this account is the forum's `BassHead99`" as a
   permanent fact after merge, which the derived-email alternative had no
   way to express at all (there'd be nothing to repoint). `ON DELETE
   CASCADE` is only the defensive fallback for a placeholder deleted
   outside the proper merge flow.

**Files to update:**
- New migration: `alter table public.users add column is_placeholder boolean not null default false;`
  plus the `import_authors` table and policy above.
- `lib/ingestion/create-placeholder-author.ts` (new) — the resolve-or-create
  helper: given `{ source, external_username, display_name? }`, look up
  `import_authors` by `(source, external_username)`; if found, return its
  `user_id`. Otherwise slugify `external_username` → check email collision
  → create the `auth.users` row **via `supabase.auth.admin.createUser({
  email, email_confirm: true, user_metadata: { full_name: display_name ??
  external_username } })`** — the Admin SDK method, not a raw SQL insert.
  There's no existing precedent in this codebase for creating an
  `auth.users` row from application code (the closest,
  `e2e/helpers/admin.ts`, only ever *looks up* users via
  `admin.auth.admin.listUsers()`; every real account today is created via
  the actual signup/OAuth flow). The one-off manual `ingestion_bot` row and
  this session's manual account cleanup both used a direct SQL
  insert/delete, which is fine for a human running a one-time fix, but
  this helper runs automatically and repeatedly — the Admin SDK method
  correctly handles GoTrue's internal bookkeeping (`identities`, etc.)
  that a raw insert bypasses. → `update public.users set is_placeholder =
  true` → insert the new `import_authors` row → return the new `user_id`.
- `audiophile-compare-schema.md` — document the new column/table.
- **`docs/supabase-database-reset.md`** — its "Step 4 — Verify the tables
  exist" section hardcodes a list of "all ten tables" and a verification
  SQL query (`where table_name in ('users', 'systems', ...)`) that will be
  stale/incomplete the moment `import_authors` exists. Add it to both the
  prose list and the query.

**Tests:**
- **Unit:** `create-placeholder-author.ts` — slugification (lowercase,
  strip, truncate, collision suffix); a second call with the same
  `(source, external_username)` returns the existing `user_id` via
  `import_authors` rather than creating a duplicate; two different raw
  usernames that happen to slugify to the same string still resolve to two
  distinct placeholders (proves the table-based lookup, not the email,
  is the source of truth).
- **E2E:** none — this is backend infrastructure with no page to drive.
- **RLS verification, explicitly required before calling this step done**
  (not just the unit tests above) — this project has had a new RLS policy
  silently fail to grant the intended access twice already (steps 26 and
  27), both times undetected until something downstream broke. Once
  `import_authors: public read` is applied, confirm it actually works with
  a direct anon-key query (e.g. `curl .../rest/v1/import_authors` with the
  anon/publishable key, expect `200` not `401`/empty) — the same technique
  used to verify RLS policies earlier in this project — before treating
  the migration as done.

**Files updated:**
- `supabase/migrations/20260707123521_placeholder_authors.sql` — applied
  to staging only, per the "staging first" deployment topology; not yet
  applied to production.
- `lib/ingestion/create-placeholder-author.ts` (new).
- `audiophile-compare-schema.md` — `users.is_placeholder`, the new
  `import_authors` table, its RLS summary row, and a new "Placeholder
  authors" section.
- `docs/supabase-database-reset.md` — Step 4's table list/count and its
  verification SQL both now include `import_authors`.
- `core.md` — build-status line updated to reflect step 30 done, 31–33
  still planned (not "all N complete", since 31–33 are known-planned but
  not built).

**Verified:** `npm run test` — 26 files / 275 tests, all passing (8 new in
`create-placeholder-author.test.ts`). `npx tsc --noEmit` — no new errors
(same pre-existing, unrelated `__tests__/supabase-*.test.ts` failures as
every prior step). RLS confirmed directly against staging with the anon
key: `GET .../rest/v1/import_authors` → `200 []`; `POST` (insert) with the
same anon key → `401`, `"new row violates row-level security policy"` —
reads work, writes are correctly rejected for anyone but the admin client.
No e2e suite run — this step adds no page to drive, as planned.

---

## ✅ 31 — Internal ingest API route (`POST /api/internal/ingest`)

**The gap this closes:** `deferred-features.md` documents the intended
shape of this route in detail but it doesn't exist yet — "Neither use case
is currently implemented."

**Decisions:**

1. **Admin/service-role client, not a per-author session — a deliberate
   change from the original doc.** The original plan had `ingestion_bot`
   authenticate via a stored Supabase session (magic link once, token kept
   in the service's environment) so normal RLS applied. That doesn't scale
   to N placeholder authors — juggling and refreshing N live sessions is
   real operational complexity for no benefit. Using the admin client
   (same pattern as the step-10 cron) removes session management entirely,
   for one bot or a hundred. The route becomes solely responsible for
   correctness (RLS won't double-check ownership), but it's already gated
   by `INGEST_SECRET` as its authorization boundary — same trust model the
   cron already relies on.

2. **Extend the documented `IngestPayload` with an `author` field.** No
   `source` field on the payload itself — with only one forum in scope,
   the route passes the constant `'lejonklou-forum'` to
   `create-placeholder-author.ts` (step 30) itself. Add `source` to the
   payload only if/when a second forum is actually being ingested, not
   speculatively now.
   ```typescript
   type IngestPayload = {
     source_ref: string
     author: {
       forum_username: string
       display_name?: string   // falls back to forum_username if omitted
     }
     track: { artist: string; title: string; album?: string; passage_note?: string }
     snapshot_a: { system_name: string; version_label: string; components?: object[] }
     snapshot_b: { system_name: string; version_label: string; components?: object[] }
     clip_a_url: string
     clip_b_url: string
     before_is_a: boolean
     votes?: Array<{
       voter: {
         forum_username: string
         display_name?: string   // falls back to forum_username if omitted
       }
       chosen_label: 'A' | 'B'
       technique_name: string
       observation?: string
       other_description?: string
     }>
   }
   ```
   Everything else matches the existing documented shape.

3. **Resolved: each vote resolves/creates its own placeholder author —
   votes are not attributed to the post's author.** `votes.user_id` is
   `NOT NULL REFERENCES users(id)` with `UNIQUE (test_id, user_id,
   technique_id)` (`audiophile-compare-schema.md`). The post's author and
   the people who commented/voted on that post are frequently different
   forum members; attributing every imported vote to the single post-
   author placeholder would hit the unique constraint the moment two
   different commenters cite the same technique on the same test — a
   routine occurrence, not an edge case. Each `votes[]` entry therefore
   carries its own `voter` (same shape as the top-level `author`), resolved
   via the same `create-placeholder-author.ts` helper from step 30. This
   is the correct extension of decision 1's "per-author placeholder, not a
   single bot" principle to voters, not just system/test owners — a
   payload for one forum post can resolve into a post-author placeholder
   plus N distinct voter placeholders (one per commenter, deduplicated by
   `forum_username` within the payload before resolution).

   **Correction found during implementation:** the plan originally assumed
   calling `create-placeholder-author.ts` twice for the same voter within
   one request was "harmless, just redundant." That's only true
   sequentially. Resolving votes with `Promise.all` over the raw `votes[]`
   array calls it *concurrently* for a repeated `forum_username` (a routine
   case — one commenter citing more than one technique), and its
   resolve-or-create check isn't safe against a concurrent duplicate of
   itself: both calls see no existing `import_authors` mapping, both then
   attempt `auth.admin.createUser()` with the same derived email, and the
   second fails on a real `auth.users` unique-email conflict. Caught by the
   integration test below (its intentional duplicate-voter case failed
   with `"failed to create auth user"` on the first run). Fixed in
   `app/api/internal/ingest/route.ts` by deduplicating voters by
   `forum_username` *before* resolving — each distinct voter is resolved
   exactly once, and every vote entry looks up its already-resolved id
   afterward. Distinct usernames still resolve in parallel safely; only
   the same-key case needed serializing.

4. **System/track matching, scoped correctly for multiple authors.**
   Tracks match globally by artist+title (tracks were never per-owner in
   the schema — no change from the original plan). Systems match by name
   **scoped to the resolved author** — two different forum members can
   both plausibly name a system "Living room rig"; matching must go
   through `systems where owner_id = :placeholder_id and name = :system_name`,
   not a bare name lookup. The original single-bot design didn't need this
   distinction since everything belonged to one owner.

5. **Atomicity — scoped to the DB-only writes.** A single test's worth of
   DB writes (track/system/snapshot resolution, test, clips, clip_mapping,
   votes) should either fully succeed or fully roll back — a partial
   import across six tables would be tedious to find and clean up by hand.
   Recommend a Postgres function (`create or replace function
   ingest_test(...) returns uuid`) called via `.rpc()`, giving
   transactional atomicity for free, over hand-rolled ordered inserts with
   manual cleanup-on-failure in the route handler. Adds one migration;
   worth it for the safety. **Placeholder author resolution (the post
   author, plus now potentially several distinct voters per decision 3)
   happens via step 30's admin-SDK helper *before* calling this RPC** —
   `auth.admin.createUser()` can't run inside a SQL function, so it's
   necessarily outside the atomic boundary, same as it already was for the
   single post-author case. This is self-healing rather than a gap: if the
   RPC fails after N placeholder authors were already created, re-running
   the same payload resolves each one to its existing `import_authors`
   mapping instead of creating duplicates (step 30's idempotency), so no
   cleanup step is needed for a partial failure here.

6. **Idempotency unchanged from the original plan** — check `source_ref`
   on `tests` first; return 200 with an "already imported" indicator
   rather than erroring, so re-running the importer over the same thread
   is always safe.

7. **Clip verification is *not* this route's job.** The route trusts that
   clip health was already confirmed upstream — by step 35's extraction,
   before a candidate was ever marked `ready`/`approved` — not by step 36's
   commit script, which is the one actually calling this route but does no
   validation of its own. Same "client already verified, server persists"
   pattern `POST /api/tests` already uses for browser-submitted clips.
   Re-verifying server-side here would just duplicate step 35's clip-health
   filter for no benefit.

**Files to update:**
- `app/api/internal/ingest/route.ts` (new).
- New migration for the `ingest_test` Postgres function (or equivalent),
  plus step 30's `is_placeholder` column if not already applied.
- `docs/google-oauth.md`-style: no new doc file needed; document the route
  in `api-conventions.md` §5 (Programmatic access) at build time, replacing
  the "not yet implemented" framing there.
- **`docs/vercel-setup.md`** — `INGEST_SECRET` is a new required env var,
  the same category as the `CRON_SECRET` this file already documents
  per-scope (Production/Preview/Development tables). Add an `INGEST_SECRET`
  row to all three, matching the existing `CRON_SECRET` pattern (a strong
  random string per environment; any string for Development).

**Tests:**
- **Unit:** none for the route itself (consistent with every other route),
  but the pure logic around it was factored out into
  `lib/ingestion/ingest-test-payload.ts` (`validateIngestPayload`,
  `resolveTestTitle`) specifically so it could be unit-tested — 16 tests in
  `lib/ingestion/__tests__/ingest-test-payload.test.ts`.
- **Integration:** implemented as a Vitest suite, not a standalone script —
  `app/api/internal/ingest/__tests__/route.integration.test.ts`, run via
  `npm run test:integration` (`vitest.integration.config.ts`, a config
  separate from the main unit suite so `npm test` never touches staging).
  Imports the route's `POST` handler directly and calls it with a
  constructed `NextRequest` against real staging — no browser, no server
  needed. See `testing.md` §11 for the full setup.

  5 tests confirm: (a) the first call creates one test/track/system/
  snapshot set and resolves the placeholder post-author plus two distinct
  voter placeholders, recording both non-duplicate votes; (b) a repeat call
  with the same `source_ref` is a no-op (`alreadyImported: true`, same test
  id); (c) a payload naming an existing system under the *same* author
  reuses it rather than duplicating; (d) two different authors naming the
  same system each get their own system row; (e) the wrong
  `x-ingest-secret` is rejected with 403. The "same voter, same technique,
  twice" case from decision 3 is exercised inside test (a) itself (three
  votes submitted, only two distinct `(voter, technique)` pairs, asserted
  as exactly 2 rows) — confirming `ON CONFLICT (test_id, user_id,
  technique_id) DO NOTHING` inside `ingest_test` silently absorbs the
  duplicate rather than erroring the whole import, so the first vote still
  counts (not quite "hits the constraint as intended" as originally
  planned — a hard error there would roll back the entire test import over
  one duplicate vote, which is worse than silently keeping the first one).

  **Data hygiene:** every synthetic `track`/`system`/`test` title is
  prefixed `[E2E]` and deleted in `afterAll`, in the FK-safe order
  `testing.md` §5 documents — this is a separate Vitest run from
  Playwright, so it cannot rely on `global-teardown.ts` and cleans up after
  itself directly. The four placeholder authors/voters it resolves are
  *not* deleted — fixed usernames, a permanent fixture analogous to
  `E2E_TEST_USER_EMAIL`.

**Files updated:**
- `supabase/migrations/20260707150400_ingest_test_function.sql` — the
  `ingest_test(payload jsonb)` function, plus explicit `REVOKE`/`GRANT` so
  only `service_role` can execute it (see decision 1's security note
  below). Applied to staging only, per the "staging first" topology.
- `lib/ingestion/ingest-test-payload.ts` (new) — `IngestPayload`/
  `IngestVote`/`IngestAuthor` types, `validateIngestPayload`,
  `resolveTestTitle`.
- `app/api/internal/ingest/route.ts` (new).
- `vitest.integration.config.ts` (new); `vitest.config.ts` — added
  `**/*.integration.test.ts` to `exclude`; `package.json` — added
  `test:integration` script.
- `app/api/internal/ingest/__tests__/route.integration.test.ts` (new).
- `docs/vercel-setup.md` — `INGEST_SECRET` added to all three
  environment-scope tables.
- `api-conventions.md` §5 — replaced the "not yet implemented" /
  single-`ingestion_bot` framing with the actual per-author-placeholder,
  admin-client, `ingest_test`-RPC design.
- `audiophile-compare-schema.md` — new "ingest_test function (step 31)"
  section (including the EXECUTE-lockdown security note); corrected the
  stale "Note on ingestion_bot" paragraph to describe per-author
  placeholders instead.
- `core.md` — build status line: step 31 done, 32–33 still planned; test
  counts updated (27 files / 291 unit tests) and a mention of the new
  integration suite.
- `testing.md` — inventory row for `ingest-test-payload.test.ts`; §7
  rewritten from "Future — integration tests" (not yet implemented) to
  describe what now exists; new §11 with the full integration-test setup,
  env vars, data-hygiene approach, and coverage list.

**Verified:**
- `npm run test` — 27 files / 291 tests, all passing (16 new in
  `ingest-test-payload.test.ts`). `npx tsc --noEmit` — no new errors (same
  pre-existing, unrelated `__tests__/supabase-*.test.ts` failures as every
  prior step).
- **EXECUTE lockdown confirmed directly against staging with the anon
  key:** `POST .../rest/v1/rpc/ingest_test` → `401`,
  `"permission denied for function ingest_test"` — the security-critical
  fix in decision 1's note is real and effective, not just a comment.
- **`npm run test:integration` — 5/5 passing against staging**, after
  fixing the concurrency bug described in decision 3's correction. The
  first run of this same suite genuinely failed on that bug (not a typo in
  the test) — caught and fixed before calling this step done, then
  re-verified: staging left with zero leftover `[E2E]`-prefixed
  track/system/test rows afterward, and the four placeholder fixture
  users persisted as intended (confirmed via direct `import_authors`
  query).

**Addendum (built as part of `build-history.md` step 32, now ✅):** step 32
(import provenance UI) added a nullable `tests.source_url` column and
extended `IngestPayload`/`ingest_test`/the route to accept and store it,
via a new migration (`20260707173905_tests_source_url.sql`) layered on top
of `20260707150400_ingest_test_function.sql`, not an edit to that
already-applied file. See `build-history.md` step 32 for the full detail —
noted here so this section doesn't read as a closed, untouched chapter.

---

## ✅ 33 — Scraper

**The gap this closes:** phase 1 of the pipeline (fetch) doesn't exist.
Originally bundled with extraction as one step; split in two because they
have very different risk profiles — this step is deterministic and fully
testable, extraction (step 35) is genuinely uncertain and was already
flagged as needing its own design pass. Splitting also gives extraction a
stable, re-runnable input: iterating on extraction logic no longer means
re-scraping the forum each time.

**Decisions:**

1. **A standalone script, not a deployed route.** `scripts/scrape-lejonklou.ts`,
   run manually/locally against a thread URL. The original doc's
   aspiration of "periodic scheduled refreshes" is explicitly **not** in
   scope for this pass — running it by hand against a specific thread is
   enough for the stated goal, and scheduling can be layered on later
   without changing anything else in this plan.

2. **Deterministic HTML parsing only — no LLM, no network calls beyond
   fetching thread pages and per-link oEmbed lookups (decision 8).** Walk
   the thread's pagination and, for each post, extract: `post_url`
   (permalink — this is also what step 35 carries into each candidate's
   `source_url`, populating the "view original post" link `build-history.md`
   step 32 adds to the UI), `author` (raw forum username/display name as shown),
   `posted_at` (ISO 8601, parsed from the forum's displayed timestamp),
   `body_markdown` (converted deterministically from the raw HTML — quote
   blocks become `> text`, links become `[text](url)` — rather than kept
   as raw HTML: extraction (step 35) is an LLM call, and clean, structured
   text is cheaper and more reliable input than HTML tag soup), and
   `links` (every outbound URL found in the body — a flat list, no
   judgement about which ones are "the" comparison clips; that's a
   semantic call, correctly left to step 35).

3. **Reply attribution needs a structured signal, not just prose.**
   Real thread behaviour (confirmed against how this specific forum is
   actually used): a listener's reply sometimes quotes the original test
   post, or an earlier reply, to indicate which test it's about — but
   votes also interleave across multiple open tests, so position in the
   thread alone isn't reliable. Capture `quoted_post_url: string | null`
   — the `post_url` this post quotes/replies to, when the forum's quote
   markup resolves to one — as the primary signal step 35 uses for
   attributing a reply to the right test. This won't always be present;
   step 35 still needs a fallback for replies without one (see step 35's
   decision 10).

4. **Track identification enrichment: fetch oEmbed metadata for
   YouTube/Vimeo links, deterministically, no LLM.** Forum creators rarely
   name the track in text — "sometimes... but often do not." A YouTube/
   Vimeo oEmbed lookup (public, unauthenticated, just another HTTP fetch)
   often surfaces a real title/author for official-style uploads, though
   it won't help for clips that are personal recordings of someone's own
   system (a plausible and possibly common case here) — it's a best-effort
   signal, not a guarantee. Extends each link to:
   ```typescript
   type ScrapedLink = {
     url: string
     oembed_title?: string
     oembed_author?: string
   }
   ```
   Reuses `detectProvider` (`lib/clips/detect-provider.ts`) to decide which
   links are worth an oEmbed call at all.

   Full output shape after decisions 2–4:
   ```typescript
   type ScrapedPost = {
     post_url: string
     author: string
     posted_at: string
     body_markdown: string
     quoted_post_url: string | null
     links: ScrapedLink[]
   }

   type ScrapedThread = {
     thread_url: string
     scraped_at: string
     posts: ScrapedPost[]   // thread order, oldest first
   }
   ```
   Written as a JSON file (path given via CLI arg, e.g.
   `scripts/scrape-lejonklou.ts <thread-url> <output-path>`) — this is the
   interface boundary with step 35, and the reason step 35 can be iterated
   on without re-hitting the forum. Scraped output shouldn't be committed —
   add its default output location to `.gitignore`.

5. **This step never calls `/api/internal/ingest` and needs no
   ingest-related credentials.** It only reads a public forum thread and
   makes public oEmbed lookups. `INGEST_SECRET` and payload construction
   belong entirely to steps 33/34 — resolves what was previously an
   unstated gap (the original combined step never said how the scraper
   would authenticate to the route; splitting makes the answer "it
   doesn't, because it isn't the part that calls it").

6. **Reuse `jsdom` for HTML parsing rather than adding a new dependency
   (e.g. `cheerio`).** `jsdom` is already a devDependency (used for
   component tests) and works fine for loading a fetched HTML string into
   a queryable DOM (`new JSDOM(html).window.document.querySelectorAll(...)`)
   outside of a test context. Fetching itself uses the built-in global
   `fetch` — no new dependency there either.

7. **Runtime: add `tsx` as a new devDependency.** Nothing in this repo can
   currently execute a standalone `.ts` file that resolves the `@/lib/...`
   path alias — there's no `ts-node`/`tsx` today, and this script needs
   that alias (it imports shared types alongside the plain parsing logic).
   `tsx` is zero-config and handles both TS and path-mapping. Add an npm
   script: `"scrape:lejonklou": "tsx scripts/scrape-lejonklou.ts"`.

8. **Parsing logic lives in `lib/`, not the script — same pattern as
   `create-placeholder-author.ts` (step 30) and `ingest-test-payload.ts`
   (step 31).** The script itself (`scripts/scrape-lejonklou.ts`) is a
   thin CLI wrapper: fetch each page, call the pure parsing functions, walk
   pagination, write the JSON file. The actual parsing —
   `parsePostsFromPage(html, pageUrl): ScrapedPost[]` (including the
   HTML→markdown conversion and quote-URL resolution) and
   `findNextPageUrl(html, currentUrl): string | null` — lives in
   `lib/ingestion/scrape/parse-thread-page.ts`, so it's unit-testable
   against fixture HTML without a live network call or a `.ts` runner. The
   oEmbed fetch (decision 4) is a separate, mockable function so it can be
   unit-tested without a live network call either.

**Files updated:**
- `lib/ingestion/scrape/parse-thread-page.ts` (new) — `ScrapedPost`/
  `ScrapedLink`/`ScrapedThread` types, `parsePostsFromPage`,
  `findNextPageUrl`.
- `lib/ingestion/scrape/fetch-oembed.ts` (new) — oEmbed lookup for
  YouTube/Vimeo links.
- `scripts/scrape-lejonklou.ts` (new) — CLI entrypoint.
- `package.json` — new `tsx` and `@types/jsdom` devDependencies; new
  `scrape:lejonklou` script.
- `.gitignore` — `scripts/output/` (covers this step's scraped output and
  step 35's future candidate files in one entry).
- `core.md` — build status line: step 33 done, 34–38 still planned; test
  counts updated (29 files / 308 tests).
- `testing.md` — inventory rows for the new parsing/oEmbed unit tests.

**Decisions confirmed/refined against the real forum** (fetched a live
thread page directly to ground this in actual markup, not assumed generic
phpBB structure):
- Posts are `div.post[id="p12345"]`; the byline (`p.author`) holds the
  author's username link and a `<time datetime="...">` with a
  machine-readable ISO timestamp — used directly, no date parsing needed.
- Pagination's "next" link carries a semantic `rel="next"` attribute —
  used instead of matching visible text (themeable/localizable).
- **`quoted_post_url` reliability turned out to be *era-dependent*, not a
  fixed forum-wide limitation — corrected after sampling further into the
  thread.** The first investigation (a 100-post sample from the thread's
  2016 start) found phpBB's default "Reply with quote" rendering as
  `<blockquote><div><cite>user wrote:</cite>text</div></blockquote>`, with
  no link back to the quoted post at all, and concluded `quoted_post_url`
  would resolve to `null` in the common case. A second, 978-post sample
  from the *end* of the thread (the most recent ~40 pages) told a
  different story: **342 of 978 posts (35%) resolve a real
  `quoted_post_url`.** The forum's phpBB software was evidently upgraded
  at some point between 2016 and today to a version with a "quote
  permalink" feature — recent quotes render as `<blockquote cite="...
  #p72033">` with an additional clickable `↑` anchor
  (`data-post-id="72033"`) back to the source post, confirmed to always
  co-occur 1:1 with the `cite` attribute on a real sampled page. The
  existing extraction code needed **no changes** to handle this — it
  already looked for any `blockquote a[href]` matching a post-id pattern,
  which happens to catch the new anchor too. Net effect: `quoted_post_url`
  is a *strong* signal for a real fraction of replies from the thread's
  more recent (and more voluminous) history, not the rare fallback
  originally described — step 35's reply-attribution design should treat
  it accordingly, while still needing the fallback heuristic for the
  majority of posts (either from before the upgrade, or with no quote at
  all).
- **Real bug found and fixed via the same deeper sampling: special-role
  usernames (admins, custom profile colors) render as `a.username-coloured`
  instead of `a.username`.** A class-based author selector silently
  dropped every post from this forum's own admin/owner — a very frequent
  poster in their own thread — across the entire original 100-post sample.
  Fixed by matching the structural `p.author strong a` wrapper both
  variants share, rather than a specific username class; added a
  regression test; re-verified 0 empty authors across a 978-post sample.
- Ephemeral `sid` (session id) query params are stripped from every stored
  permalink (`post_url`, resolved `quoted_post_url`) so they stay stable
  across scrapes — a `sid` is per-session, not part of a real permalink.
- Confirmed live end-to-end (not just against fixtures): ran the actual
  CLI script against the real thread for ~3 real pages (deliberately
  stopped short of the full 316-page crawl — no reason to hit someone
  else's forum harder than needed just to verify the code works), correctly
  walking pagination and extracting real posts, including a real quoted
  reply, matching the fixture-based unit test expectations exactly. Two
  further real samples (100 posts from the start, 978 posts from the last
  ~40 pages) drove the two corrections above and gave step 35 real,
  representative examples of a vote-only post with no links, a genuine
  reveal post (`A = Lingo 2 ... B = Lingo 3`, confirming letter labels are
  real alongside the bare-number style seen in the earlier sample, and
  that reveals name components/systems, not tracks — matching decision 8's
  design), and a deferred-reveal announcement ("one more shootout, then
  I'll reveal...").

**Finding from this verification, now being addressed by `build-history.md`
step 34 (Google Drive clip provider support) — partially resolved, not
blocking this step either way:** real clip hosting has shifted over time
from Dropbox/YouTube (2016-era sample) to Google Drive, Google Photos, and
iCloud shared links (current-era sample: 74 Drive + 52 Photos + 17 iCloud
links, vs. 3 YouTube links total across both samples). None were
recognized by `detectProvider()` (`youtube`/`vimeo`/`direct`/`unknown`) —
all fell into `unknown`, where the existing clip-health check doesn't
meaningfully validate them (a share page returns `200 text/html`
regardless of whether the underlying media actually plays) and the app's
player shows a bare link rather than embedded playback. Step 34 adds
first-class `google-drive` provider support (a stable, confirmed-embeddable
`/preview` URL exists), closing the gap for the largest single host (74 of
143 links). **Google Photos and iCloud remain `unknown` by design, not as
a remaining gap** — neither has a public, stable, embeddable URL for
third-party use, and screen-scraping one would be fragile. Not blocking
this step either way.

**Refinement (built): resumable per-page caching, so a re-run doesn't
re-fetch (or re-hit) the live forum for pages it already has.** Before
this, every run walked pagination from page 1 and re-fetched every page
over the network, every time — fine for a first scrape, wasteful and
impolite to the real forum for a re-run that's only trying to pick up a
few new pages, or to re-derive output after a parser fix (like the real
`username-coloured` bug found and fixed above) without needing fresh
network content at all. Layout, derived from the CLI's own
`<output-path>` argument rather than a hardcoded location (the script's
signature is `scrape-lejonklou.ts <thread-url> <output-path>` — the
output path is caller-supplied, so the cache must be too):
```
<dirname(outputPath)>/scrape-cache/
  raw/page-0001.html, page-0002.html, ...      cached raw HTML per page
  parsed/page-0001.json, page-0002.json, ...   parsed, oEmbed-enriched
                                                ScrapedPost[] per page
<outputPath>                                    assembled ScrapedThread —
                                                 unchanged interface, still
                                                 what extraction reads
```
Walking pagination, each page checks its own `raw/` cache first: present
→ read from disk instead of fetching (no network call at all, no load on
the real forum); its `parsed/` file also checked separately — present →
skip parsing (and oEmbed enrichment, see below) too, absent → re-parse the
cached HTML (still no network call). This gives a human two distinct,
file-deletion-driven signals: delete only a page's `parsed/` file to force
a re-parse from cache (the right move after a parser fix); delete both
`raw/` and `parsed/` to force a genuine re-fetch (the right move when the
live content itself needs refreshing). The final assembled thread file —
extraction's actual input — is still written every run exactly as today;
nothing about step 35's interface to this step changes. **Accepted
limitation, not solved by this design:** caching by page assumes the
forum's own pagination boundaries stay stable between runs; if an old
post is deleted or moved on the live forum, cached pages could silently
stop corresponding to what a fresh fetch would produce, undetectable
unless the cache is deliberately cleared — reasonable for a mostly-static
historical archive, not guaranteed in general. **This is exactly why
step 35's `source_ref` (decision 2) keys candidates off the real phpBB
post ID parsed from `post_url`, not array position** — this caching
design means a re-scrape can genuinely process a different subset/order
of network activity than a prior run, and only an identifier tied to
the post's own permanent identity survives that; an array-position key
would silently drift.

**oEmbed enrichment moves per-page, folded into the `parsed/` cache —
not a separate whole-thread pass at the end.** The original draft of
this refinement only cached the fetch+parse cost; oEmbed lookups
(decision 4) still ran as one pass over every post after the whole walk
finished, regardless of caching, so a cached page would still re-pay its
oEmbed cost on every run. Fixed by enriching a page's links immediately
after parsing it, before writing that page's `parsed/` cache file — a
cached page's parsed JSON already carries its enrichment, so only
genuinely new/reprocessed pages make oEmbed calls at all. No change to
the output itself, just when enrichment happens.

**Coupling with step 35's own "delete a file to reprocess" mechanism
(decision 16), not to be confused with each other:** deleting a
candidate file forces extraction to reprocess the posts that built it,
but only using whatever's currently in the assembled thread file — if
that still reflects a stale cached page (nobody cleared `raw/`/`parsed/`
for it), the candidate gets "reprocessed" against the same old content,
not fresh content. Getting genuinely fresh live content into a
reprocessed candidate requires clearing *both* caches — this step's page
cache and step 35's candidate file — not just the one that seems
relevant.

**Files updated (this refinement):**
- `lib/ingestion/scrape/page-cache.ts` (new) — read/write helpers for a
  page's raw HTML and parsed+enriched JSON, given a base cache directory
  and page number; pure and unit-testable, no network calls, following
  this step's own established pattern (decision 8: parsing logic lives
  in `lib/`, not the script, precisely so it's testable without a live
  network call). Cache misses return `null` (never throw); any
  non-`ENOENT` read error still propagates rather than being silently
  treated as a miss.
- `scripts/scrape-lejonklou.ts` — per-page read-cache-or-fetch and
  read-cache-or-parse-and-enrich logic (`loadPage`), using
  `page-cache.ts`'s helpers; cache directory derived from
  `join(dirname(outputPath), 'scrape-cache')`; the polite
  `REQUEST_DELAY_MS` delay now only applies after a page that was
  actually fetched over the network, not a cache hit; still assembles
  and writes the final thread file unchanged at the end. Also gained a
  new optional third CLI argument, `[max-pages]`, capping how many pages
  a single invocation walks (independent of the existing `MAX_PAGES=500`
  safety constant) — added so a bounded sample near the thread's end
  could be taken and then resumed without walking the whole thread from
  page 1 to get there; `<thread-url>` was already usable with any
  `start=` offset, not just the thread's first page, so no change was
  needed there, just documented more explicitly in the script's header
  comment.
- `lib/ingestion/scrape/parse-thread-page.ts` — unchanged, as planned;
  `parsePostsFromPage`/`findNextPageUrl` have no new callers' concerns to
  accommodate.
- `.gitignore` — no change needed; `scripts/output/` already covers the
  new `scrape-cache/` subfolder since the output path stays under it.
- `__claude_context__/testing.md` / `core.md` — new inventory row and
  updated test counts (30 files / 322 tests).

**Verified:** `npx vitest run lib/ingestion/scrape/__tests__/page-cache.test.ts`
— 8/8 passing (cache miss returns `null`; raw HTML and parsed+enriched
JSON round-trip; keyed correctly per page number, not overwriting
siblings; page numbers zero-padded on disk; cache directory created on
first write without needing to pre-exist; a non-`ENOENT` read error
propagates rather than being swallowed). Full suite:
`npm run test` — 30 files / 322 tests, all passing (8 new). `npx tsc
--noEmit` — no new errors (same pre-existing, unrelated
`__tests__/supabase-*.test.ts` failures as every prior step).

**Also confirmed live, end-to-end, against the real forum** (fetched the
thread's own page 1 first, once, to read its real pagination — 316 pages,
25 posts/page, 7,878 posts total at time of testing — and compute a
starting URL 40 pages from the end, rather than walking there from page
1): ran the CLI twice against `https://www.lejonklou.com/forum/
viewtopic.php?f=2&t=3233&start=6900`, first capped at 39 pages, then
uncapped. Run 1 made 39 genuine fetches and stopped exactly one page
short of the real end (975 posts). Run 2 read all 39 pages from cache —
zero network requests for any of them — and made exactly one real fetch,
for the true last page (978 posts, the 3-post difference matching what's
actually on that page). Cache directory held 40 `raw/` + 40 `parsed/`
files afterward, one per page. This output became the new
`scripts/output/lejonklou-sample-tail/thread.json` (see decision 15 in
step 35), superseding the older one-off-script-generated sample of the
same name — now regenerable via this CLI directly rather than a
throwaway script.

**Tests:**
- **Unit:** `lib/ingestion/scrape/__tests__/parse-thread-page.test.ts` (10
  tests) — author/timestamp/permalink/body/links extraction against
  fixtures modeled on the real markup above; `sid` stripped from
  permalinks; quote → markdown conversion; `quoted_post_url` resolves to
  `null` for a default phpBB quote and to a real URL for a manually-linked
  one; links inside a quote excluded from the post's own `links`; a post
  missing its username link or timestamp doesn't throw; multiple posts
  per page extracted in document order; `findNextPageUrl` via `rel="next"`,
  `null` on the last page.
  `lib/ingestion/scrape/__tests__/fetch-oembed.test.ts` (6 tests) —
  successful YouTube/Vimeo lookups populate `oembed_title`/`oembed_author`;
  a non-YouTube/Vimeo link is skipped with no network call; a failed/404
  response or a network error is swallowed rather than thrown;
  `enrichLinksWithOEmbed` enriches each link independently, in order.
- **E2E / integration:** none planned, and none added — no app code, no
  deployed route, no DB. (Verified live against the real forum instead —
  see above.)

**Verified:** `npm run test` — 29 files / 308 tests, all passing (16 new).
`npx tsc --noEmit` — no new errors (same pre-existing, unrelated
`__tests__/supabase-*.test.ts` failures as every prior step). Parsing
logic additionally verified directly against a real, live-fetched forum
page (not just fixtures) — see "Decisions confirmed/refined" above.

---

## ✅ 35 — Extraction

**The gap this closes:** phases 2–3 of the pipeline (semantic extraction,
clip-health filtering) don't exist. This is genuinely new capability, not
a variation on an existing pattern, and remains the highest-risk step in
this plan.

**Decisions:**

1. **Output is a candidate repository, not direct calls to
   `/api/internal/ingest`.** Extraction never talks to the deployed app at
   all — it reads step 33's `ScrapedThread` JSON and writes one JSON file
   per candidate test (a draft `IngestPayload` plus `issues`) under
   `scripts/output/candidates/`. Committing (calling the ingest route) is
   entirely step 36's job — see that step. This is the mechanism that lets
   a human fix a problem (like an unidentified track) *before* anything is
   ever sent, so the app itself never needs a "correct a field after
   ingest" feature.

   **`issues` is a typed list of codes, not free text — a separate
   `notes` field carries any human-readable detail.** Earlier drafts of
   this design mixed short codes (`"unidentified_track"`) with full
   sentences (a validation error message) in the same array — awkward
   for step 37 tooling to filter or group on, and exactly the kind of
   repeated-string-literal risk this repo's own convention exists to
   catch, since these codes are written by extraction and read by step
   37. Fixed shape:
   ```typescript
   type IssueCode =
     | 'unidentified_track'      // decision 7
     | 'unresolvable_post_id'    // decision 2
     | 'missing_timestamp'       // decision 10
     | 'ambiguous_attribution'   // decision 10
     | 'dead_clip_url'           // decision 12
     | 'invalid_payload'         // decision 13

   type Candidate = {
     payload: Partial<IngestPayload>
     issues: IssueCode[]
     notes?: string[]   // e.g. validateIngestPayload's error text
     contributing_posts: string[]   // decision 16
   }
   ```
   Every other decision below that writes to `issues` uses one of these
   codes; anything that would otherwise be free text (like
   `validateIngestPayload`'s returned `error` string, decision 13) goes
   in `notes` instead.

2. **`source_ref` gets a pair index.** A single post can describe more
   than one clip pair — "if there is more than one pair, each pair is a
   before/after of the same change, but with different tracks" — so one
   post can yield multiple independent candidates, each its own test. Key
   candidates as `<thread>:post-<n>:pair-<i>` (`pair-1` even when there's
   only one, for consistency). Every candidate also carries a `source_url`
   — step 32's (in `build-history.md`) column and payload field — set to
   the initiating post's `post_url` (step 33's scraper output); all pairs
   from the same post share that post's URL.

   **`<n>` is the real phpBB post ID, parsed out of `post_url`, never
   the post's array position.** Left undefined in earlier drafts of this
   decision — a real gap, because `ScrapedPost` has no separate numeric
   ID field, only `post_url`. Array position was the tempting default
   and would work today, but it's fragile in exactly the way step 33's
   planned per-page caching refinement makes more likely, not less: if
   an old post is ever deleted from the live forum (already a named
   limitation of that caching design), every later post's array index
   shifts on a re-scrape, silently changing `source_ref` for candidates
   already sitting in `approved`/`ingested` — breaking decision 4's
   idempotency check and decision 16's `contributing_posts` skip-set,
   both keyed on that exact string. Parsing the real post ID out of
   `post_url` via the same `/[?&]p=\d+/` pattern step 33 already uses
   for `quoted_post_url` matching gives a stable identifier tied to the
   post's own permanent identity on the forum, unaffected by pagination
   or caching. This also matters for decision 7's placeholder track
   title, which embeds `source_ref` directly — an unstable `n` would
   silently rename a human-visible placeholder across re-runs, not just
   break internal bookkeeping.

   **A test-defining post whose own `post_url` has no parseable ID is
   flagged, not silently keyed on nothing.** `parse-thread-page.ts` falls
   back to `''` for `post_url` itself (`permalink ? canonicalizeUrl(...)
   : ''`), the same defensive pattern as `posted_at` — but unlike a
   missing timestamp, a missing/unparseable post ID hits the mechanism
   this whole decision exists to protect: with no stable identifier at
   all, two such posts would otherwise collide on whatever placeholder
   key they shared, exactly the "unrelated things silently merged" risk
   decision 7 already calls out for unidentified tracks. A candidate
   built from such a post still gets created — so a human has something
   to look at — but is flagged `needs_review` immediately with
   `'unresolvable_post_id'` (decision 1's typed shape), keyed on a
   clearly-marked fallback: `<thread>:unresolvable-<hash>:pair-<i>`,
   where `<hash>` is a short hash of the post's own content (`author` +
   `posted_at` + a prefix of `body_markdown`) — **not** array position.
   Array index was the first idea here and was rejected: it would just
   reintroduce, one level down, the exact instability this whole
   decision exists to eliminate — if a live-forum edit shifts positions
   between runs, an array-index fallback could either (a) silently
   duplicate an already-`approved` candidate (its shifted index no
   longer matches its own file) or, worse, (b) cause decision 4's
   "already exists in `approved/`, skip it" check to match a
   *completely different, never-before-seen* post purely because it
   landed on a now-reused index — silently dropping a real post with no
   flag at all. A content hash avoids both: it's effectively
   collision-free across two genuinely different posts, and — unlike
   array position — it's actually *stable* for the *same* post across
   runs regardless of where it sits in the array, since it doesn't
   depend on position. It only changes if the post's own content
   changes, which is exactly the case where reprocessing is arguably
   correct anyway. Still accepted as a narrow, rare-case limitation, the
   same spirit as the Photos/iCloud and pagination-stability limitations
   already accepted elsewhere in this plan — just a safer version of
   that limitation than the array-index approach would have been.

3. **Status is folder location, not a field — one subfolder per stage,
   no `status` field inside the JSON at all.**
   ```
   scripts/output/candidates/
     pending/               candidates missing something required (decision 6)
     needs_review/          complete, but extraction flagged an issue (decision 7)
     ready/                 complete, no flagged issues — assigned automatically
     approved/              a human moved it here — step 36's staging input
     ingested/staging/      step 36 moved it here after committing to staging
     ingested/production/   step 36 moved it here after committing to production
     expired/               closed automatically — no reveal within 21 days
                             of the candidate's post (decision 10); not part
                             of the approved → ingested chain, a dead end
     broken/                a human moved it here after manually checking its
                             clip URLs and finding them genuinely unusable —
                             added post-trial (decision 15's real run), once
                             candidates with real dead hosting (taken-down
                             share links, etc.) started showing up; distinct
                             from decision 12's dead_clip_url, which only
                             ever catches a direct-provider link failing its
                             HEAD check at extraction time — never a
                             youtube/vimeo/google-drive link trusted by URL
                             shape, and never a link that goes dead later
   ```
   A candidate's status is simply which folder its file is sitting in —
   "approving" a `ready` (or fixed `needs_review`) candidate means moving
   its file into `approved/`; nothing to keep in sync, no risk of a status
   field drifting from where the file actually lives. `pending` is
   materialized as soon as the initiating clip-pair post is found, even
   before any votes or reveal exist, so the repository shows what's still
   "in flight." The two `ingested/` stages form a strict chain — see step
   34 decision 1 for why `ingested/staging/` is also production's *input*
   folder, not just a record. `expired/` is the one transition extraction
   makes on its own without a human moving anything — see decision 10.
   `broken/` is the opposite: nothing ever writes there automatically,
   only a human, the same manual-edit spirit as decision 7's track
   resolution.

4. **Extraction is incremental and safe to re-run.** Re-running against an
   updated scrape (e.g. after a re-scrape picks up new posts) creates or
   updates a candidate's file in `pending/`, `needs_review/`, or `ready/`
   as more of the thread resolves, but **never touches a candidate whose
   file already exists in `approved/`, `ingested/staging/`,
   `ingested/production/`, `expired/`, or `broken/`** — checked by
   looking for that `source_ref`'s filename in those five folders first.
   A human decision, once made, isn't silently clobbered by a later run;
   a candidate already in flight through the ingest chain can't be reset
   back to `pending` by a fresh scrape; an automatically-`expired/`
   candidate (decision 10) can't be silently un-expired by a later run
   either — even if a late reveal eventually shows up in an updated
   scrape, it's ignored, consistent with "a vote/reveal after the close
   point doesn't count" — and a human's `broken/` determination can't be
   silently reversed by a later run either. This decision is about which
   *files* a re-run won't move or overwrite; decision 16 covers the
   complementary question of which
   *posts* a re-run won't bother re-sending to the model at all.

5. **Three distinct concepts, not one — clarified against how the forum
   actually works:** the *forum label* (`A`/`B`, `X`/`Y`, `A1`/`B1`, etc.
   — arbitrary, assigned by the creator per post, for discussion); the
   *app's internal blind label* (`clips.label`, assigned by us at ingest
   time, unrelated to the forum's scheme); and *before/after*
   (`clip_mapping`), stated by the creator in a separate, later reveal
   post — sometimes disclosed alongside the tracks (decision 7), often not
   disclosed at all. Votes resolve against the *forum* label as soon as a
   vote post is seen (mapped to whichever of our internal `A`/`B` the
   corresponding clip URL was assigned); before/after resolves only from a
   reveal post. **Real sampling found "forum label" isn't always a letter
   scheme** — one full test cycle in the head sample used bare numbers
   ("1153" vs "1155", presumably recording/file numbers) as its only
   reference scheme, with no letters mentioned anywhere. Extraction's
   label-matching needs to treat a bare number exactly like an `A`/`B`/`X`/
   `Y` label, not as a special case.

6. **A test that never gets revealed is never promoted to `ready`.**
   `before_is_a` is mandatory for `ingest_test` and has no other source —
   rather than guess, or add an update-after-ingest mechanism (which the
   app has no other use for and shouldn't grow just for this), an
   unrevealed test is explicitly out of scope for this import. Votes and
   snapshot data for it are simply never committed. It doesn't sit in
   `pending` forever, though — decision 10's 21-day auto-expiry moves it
   to `expired/` once it's been open that long without a reveal, rather
   than leaving it open indefinitely.

7. **Track identification: try text, then step 33's oEmbed enrichment;
   if both fail, don't skip — create a flagged placeholder.** Order of
   attempts: (a) explicit track naming in the reveal or original post,
   when present; (b) `oembed_title`/`oembed_author` from step 33, when
   present and plausible. If neither resolves, still create the candidate
   with a **per-post-unique** placeholder (e.g. `artist: "Unidentified"`,
   `title: "Unidentified passage — <source_ref>"` — never one shared
   "Unknown" row, which would incorrectly merge unrelated tracks under
   `ingest_test`'s exact-match lookup) and mark the candidate
   `needs_review` with `issues: ["unidentified_track"]`. A human resolves
   it by editing the candidate file directly — typing in the real name if
   they recognize it, or leaving the placeholder and approving anyway if
   they're satisfied with that outcome.

   **The placeholder path is the expected common outcome here, not a rare
   fallback — real data quantifies this.** oEmbed enrichment succeeded on
   only ~1–4% of links across two real samples (1/25, then 3/217). Budget
   `needs_review` review volume in step 37 accordingly: most candidates
   will need a human glance at track identity, not a handful of edge
   cases.

   **A text label distinguishing clip A from clip B is not reliably the
   real track name — a genuine risk of confidently-wrong data, not just
   missing data.** Real example: Charlie1 named three clips "Laa Laa,"
   "Tinky Winky," and "Po" — Teletubbies characters, obviously just
   nicknames to tell the clips apart, not song titles. Compare Spannko's
   "John Prine 1 Buddha," which does look like a genuine artist reference.
   Extraction must distinguish "this is what the creator calls the
   recording" from "this is genuinely identifying a song" — when unsure,
   default to the placeholder path rather than guessing. Producing a
   wrong-but-confident track name is worse than an honest
   `unidentified_track` flag.

8. **System naming is simplified: one placeholder system per creator,
   not inferred per post.** Creator posts "rarely provide much information
   about systems... to infer this would require a much deeper scan... 
   probably out of scope," but "generally say what has changed." So:
   one system per resolved creator placeholder (not named from post
   content — named from the creator's identity, e.g. `"<display name>'s
   system"`), with each post's "what changed" text becoming the new
   snapshot's `version_label`. This deliberately doesn't try to detect "is
   this description a new system entirely" — a creator with two genuinely
   distinct systems would incorrectly get merged into one, an accepted,
   documented limitation for this historical import rather than something
   worth deep inference. De-risks, but doesn't eliminate, the harder half
   of the old "continuity" problem — see decision 10.

9. **Vote revisions are resolved entirely within extraction — no change
   to `ingest_test`.** "Listeners sometimes change their vote or add a
   comment" is a real, expected occurrence, but since a candidate is only
   written once its underlying state is gathered (and re-extraction
   updates a non-`approved` candidate rather than appending to it),
   extraction always resolves to the *final* vote per (voter, technique)
   before it's ever written to a candidate file. `ingest_test`'s
   `ON CONFLICT ... DO NOTHING` remains a defensive backstop only — it
   should never actually fire if extraction has done its job; if it does,
   that's a signal of an extraction bug, not something the SQL layer
   should try to paper over.

10. **Reply-to-test attribution is resolved by processing the whole
    thread as a single chronological walk with one shared, cross-author
    index — not by grouping posts by author.** The original framing
    ("groups by author, walks posts") was wrong for what this decision
    actually needs: a voter's reply lives in the *voter's* post stream,
    but it has to match against the *creator's* pending candidate — a
    different author entirely. Grouping by author never gives a voter's
    group visibility into another author's open candidates. Instead:

    - Posts are walked in thread order (`ScrapedThread.posts` is already
      chronological, oldest first — step 33's own type comment confirms
      this), across all authors together, one post at a time.
    - One shared index is built from whatever's already on disk at
      startup — and this read spans **all six** candidate folders
      (`pending/`, `needs_review/`, `ready/`, `approved/`, `ingested/*`,
      `expired/`), not just the three writable ones, because decision
      16's `contributing_posts` skip-set needs every folder's provenance
      to avoid reprocessing a post that already contributed to an
      `approved`/`ingested`/`expired` candidate. The *open-candidate*
      matching set this decision uses, though, only ever draws from
      `pending/`, `needs_review/`, and `ready/` — a candidate in
      `approved/`, `ingested/*`, or `expired/` is closed by definition
      and never touched or offered as a match target (decision 4). Kept
      current as the walk progresses. It's queryable three ways:
      by `post_url` → candidate (the `quoted_post_url` direct hit, this
      decision's primary signal, still true — sampling found 35% of a
      978-post recent-history sample resolves this way, vs. effectively
      0% in the thread's early history, evidently after a forum software
      upgrade added a resolvable quote-permalink) — **every post
      attributed to a candidate gets indexed under this key, not just its
      test-defining post**, since a real quote chain can reply to a
      previous *reply* rather than the original post; indexing only the
      originating post would miss that case and fall through to the
      weaker label-matching fallback for something that should have been
      a direct hit; by `(creator forum_username, forum_label)` →
      candidate (the bare-label fallback — a label like "1153" only means
      something scoped to one creator); and by `creator forum_username` →
      that creator's own candidate history (this doubles as decision 8's
      continuity context — same index, just queried differently, not a
      second mechanism).
    - **A candidate is "open" (eligible for vote/label matching) only
      from its test-defining post until its creator's reveal post — a
      reveal closes it immediately**, the moment a post is classified as
      that candidate's reveal (regardless of whether the reveal data is
      clean enough to reach `ready` vs. stay `needs_review`). Any later
      post using the same label is discarded, not treated as a vote — a
      "vote" cast after the reveal isn't blind and shouldn't count.
    - **A candidate that's still open 21 days (by post timestamp, not
      wall-clock — this is historical data) after its own test-defining
      post is expired automatically**, moved to the new `expired/`
      folder (decision 3) rather than left open indefinitely. Checked
      against the currently-processed post's timestamp as the walk's
      clock, before evaluating that post.
    - **A candidate whose own test-defining post has no timestamp is
      flagged `needs_review` immediately, not tracked for expiry at
      all.** `parse-thread-page.ts` falls back to `''` for `posted_at`
      when a post's `<time datetime>` element is missing — an `Invalid
      Date`, and any comparison against it is `false`, so the 21-day
      check would otherwise silently never fire for that one candidate
      rather than erroring. Rather than let that pass as quiet
      undefined behavior, a candidate created from a timestamp-less post
      goes straight to `needs_review` with `issues: ["missing_timestamp"]`
      — consistent with decision 7's existing principle of flagging
      rather than guessing. (An arbitrary *non-candidate-defining* post
      lacking a timestamp — e.g. a vote — doesn't get this treatment; it
      just doesn't get to serve as the walk's clock for that one step,
      and expiry sweeps resume at the next post with a valid timestamp.)
    - Net effect: the set of candidates open for matching at any point
      in the walk stays small (bounded by however many tests are
      simultaneously mid-flight, not by thread length), so the fallback
      context passed to each `generateObject` call is simply "all
      currently-open candidates" — no recency window or positional
      heuristic needed.
    - **How this stays correct on a resumed run (decision 16), made
      explicit:** the walk still *visits* every post, in thread order,
      even when a post's `generateObject` call is skipped — only the
      model call is skipped, not the post's participation in the walk.
      This matters because the 21-day expiry sweep above runs "before
      evaluating that post," using that post's timestamp as the clock;
      if a skipped post were dropped from the walk entirely rather than
      just from the LLM call, the clock would stall at wherever the last
      *unskipped* post was, and a candidate that should expire somewhere
      in already-processed territory wouldn't, potentially until the
      walk reaches a post outside the skip-set — which, on a fully
      cached re-run with nothing new added, could be never. Separately,
      a *loaded* candidate's open/closed state is never replayed
      post-by-post — it's read directly off the candidate's own current
      content (whether its reveal-derived fields, like `before_is_a`,
      are already populated). `contributing_posts` (decision 16) only
      has to answer "has this post been accounted for," not "what did it
      do" — it doesn't need per-post role information to make any of
      this work.

    **Concrete real example the fallback still needs to handle:** a reply
    saying "I prefer the first one (1153)" with no link and no quote at
    all — "1153" is a bare-number forum label (decision 5) that only
    resolves to a specific candidate by matching against labels already
    open for that creator, not via any link or quote signal. This remains
    exactly the kind of ambiguity decision 7's `needs_review` mechanism
    exists for: an extraction that isn't confident which open candidate a
    vote belongs to should flag it — `'ambiguous_attribution'` added to
    `issues` (decision 1's typed shape) — rather than guess silently.

11. **Technique is hardcoded to `'Tune Method'` for every vote.** The
    forum's stated convention is that all listeners use this evaluation
    method — a valid cross-test assumption for this dataset. Removes the
    free-text-to-vocabulary mapping risk entirely for the common case; no
    attempt is made to detect a listener using a different technique.
    **Stronger evidence than "the forum generally follows this
    convention":** the live page itself carries a hidden (`display: none`)
    topic-level field reading "We use the Tune Method to evaluate
    performance" — the thread declaring its own rule directly, not just an
    inference from how individual replies happen to be phrased (most vote
    posts read as casual personal preference — "more musical," "more
    engaging" — with no explicit method name at all, which would be weak
    evidence on its own).

12. **"Unbroken" is enforced here, not in the ingest route** — by
    precisely mirroring `POST /api/clips/verify`'s real branch (`app/api/
    clips/verify/route.ts`), which is a two-way split, not a per-provider
    check: call `detectProvider` on the link; **only when
    `provider === 'direct'`** does a real network check happen, via
    `checkDirectUrl` (`lib/clips/check-url.ts` — it takes the whole
    `DetectedClip`, not a raw URL); every other provider
    (`youtube`/`vimeo`/`google-drive`/`unknown`) is trusted as
    `url_status: 'ok'` unconditionally, with **no HEAD request or any
    other network check at all** — matching URL shape is the entire
    verification for those. Drop the candidate (or mark it `needs_review`
    with `'dead_clip_url'` added to `issues`, decision 1's typed shape)
    only when a `direct` link's `checkDirectUrl` result comes back dead;
    there is no equivalent signal for any other
    provider. Zero new clip-validation logic — this decision is about
    calling the existing two functions with the same branch the deployed
    route uses, not adding a third path. **Caveat, partially resolved by
    `build-history.md` step 34:** Drive links get real embedded playback
    via the `google-drive` provider, still with no health check (same
    trust-the-URL-shape treatment as youtube/vimeo). Google Photos and
    iCloud links (~69 of the ~150 found across both samples) remain in
    `detectProvider`'s `unknown` bucket by design — no stable embeddable
    URL exists for either — and get **zero verification of any kind**
    under this mirrored logic, not even a weak share-page reachability
    check (there is no such check anywhere in this codebase to reuse for
    them). "Unbroken" is meaningfully enforced for direct links only, with
    youtube/vimeo/google-drive trusted by URL shape and Photos/iCloud
    links entirely unverified — an accepted limitation surfaced to a
    human at approval time (step 37), not an open question to resolve in
    code.

13. **Validation happens continuously, not as a separate "dry-run mode" —
    and reuses the real `validateIngestPayload`, not a re-described
    equivalent.** Because extraction only ever writes local candidate
    files and never calls the ingest route itself, there's no live/dry-run
    mode distinction to design — every run is inherently side-effect-free
    against the app. The original wording here ("validated against the
    same constraints `ingest_test` would enforce") was a missed
    opportunity: `lib/ingestion/ingest-test-payload.ts`'s
    `validateIngestPayload` already *is* that check (`source_ref`,
    `author.forum_username`, track/snapshot fields, `clip_a_url`/
    `clip_b_url`, `before_is_a` as boolean, and per-vote `voter`/
    `chosen_label`/`technique_name` presence), tested and used by the real
    ingest route today — extraction should call it directly on each
    assembled draft `IngestPayload`, not hand-roll an equivalent check
    that can silently drift from the real one. A candidate is marked
    `ready` only when `validateIngestPayload` returns `{ valid: true }`;
    otherwise it stays at `needs_review` with `'invalid_payload'` added to
    `issues` and the returned `error` string recorded in `notes` (decision
    1's typed shape). Decision 12's clip-health check runs
    *additionally* — `validateIngestPayload` deliberately doesn't check
    reachability, only presence, so it doesn't replace decision 12.
    **Worth knowing when building step 37's review tooling:** the real
    function returns on the *first* failing check, not a full list — a
    candidate with two separate problems shows one at a time in `notes`,
    and fixing it and re-running is what surfaces the second, not a
    single exhaustive report up front.

    **Real gap `validateIngestPayload` doesn't close: `technique_name` is
    never checked against real seeded data anywhere reusable.** The only
    place that happens today is inside the `ingest_test` SQL function
    itself (`raise exception ... unknown listening technique`), which
    extraction never calls (decision 1). Since decision 11 hardcodes
    every vote's `technique_name` to a single literal, the real risk is
    narrow — just "does that literal exactly match the seeded
    `listening_techniques.name` value" — so the fix is proportionate, not
    a new DB dependency for extraction: export the literal as a single
    named constant (`TUNE_METHOD_TECHNIQUE_NAME` in
    `ingest-test-payload.ts`, alongside the types it's already adjacent
    to) instead of an inline string in extraction code, per this repo's
    repeated-string-constants convention. Extend `validateIngestPayload`
    with an optional third parameter, `knownTechniques?: string[]` —
    when omitted (the real ingest route's existing call site is
    unaffected, since forum-import payloads there aren't restricted to
    one technique), no change in behavior; extraction calls it with
    `[TUNE_METHOD_TECHNIQUE_NAME]`, catching a typo or future drift
    between decision 11's constant and this list at validation time
    rather than only at commit time. A unit test separately pins that
    constant's value against the real seed row from
    `20260625094142_initial_schema.sql`, so a future migration renaming
    the seeded technique would be caught by a failing test, not silently.

14. **Extraction technology: Vercel AI SDK (`ai` package), `generateObject`
    with a Zod schema, via the AI Gateway using a plain
    `"anthropic/claude-..."` model string** (no separate `@ai-sdk/anthropic`
    package). Chosen over calling the Anthropic API directly or using the
    Claude Agent SDK: it fits this project's Vercel-native conventions,
    and schema-validated structured output directly satisfies decision 13
    — a malformed extraction is a catchable Zod error, not something to
    hand-roll validation for. Context passed to each call is drawn from
    decision 10's shared index — the author's own prior candidates for
    decision 8's continuity tracking, plus currently-open candidates
    thread-wide for decision 10's cross-author attribution —
    deliberately simpler than giving the model its own tool-using agent
    session, which isn't needed for what's fundamentally single-shot
    structured extraction repeated with accumulated context.

    **Model: Sonnet 5, one model throughout, no tiering.** Matches the
    reasoning bar decisions 7 and 10 actually need (distinguishing a
    genuine track name from a nickname; cross-author label matching) —
    Haiku risks silent misclassification on exactly those judgment calls
    (a wrong "irrelevant" call never surfaces in `needs_review` at all,
    unlike a wrong-but-flagged extraction), and Opus's extra quality is
    marginal here given decision 7's `needs_review` safety net already
    absorbs the uncertain cases. A cheap-triage-then-strong-model tier was
    considered and rejected as premature complexity for a one-time
    historical import.

    **Calls: one `generateObject` call per post, no pre-filter.** A
    link-based pre-filter is unsafe — decision 10's own motivating
    example ("I prefer the first one (1153)") is a real vote with no
    link at all, so filtering on link presence would silently drop real
    votes. Batching multiple posts into one call was also considered and
    rejected: decision 10's shared index needs to update *after every
    single post* so a later post in the same batch can see an earlier
    one's newly-created candidate, which batching either breaks or only
    partially preserves. A safe deterministic pre-filter is possible in
    principle (skip only when a post has no link, no `quoted_post_url`,
    and zero currently-open candidates thread-wide) but was deferred —
    its failure mode is a *silent* skip with no `needs_review` flag,
    worse than the cost of a wasted call on a boring post, and not worth
    the added code surface until a real per-run cost number shows it's
    needed.

    **`technique_name` is not part of the model's output schema at
    all.** Since decision 11 already hardcodes every vote to
    `TUNE_METHOD_TECHNIQUE_NAME` and explicitly puts detecting a
    different technique out of scope, asking the model to also produce
    this field would only add a value that's immediately discarded and a
    field it could hallucinate for no purpose. The Zod schema for a vote
    covers `voter`/`chosen_label`/`observation`/`other_description`
    only; `technique_name` is attached deterministically by extraction
    code afterward, same source as decision 13's constant.

    Needs a new `ai` (and `zod`, not currently a dependency) package, and
    the `AI_GATEWAY_API_KEY` env var in `.env.local` — the standard
    mechanism for authenticating to Vercel AI Gateway from outside a
    Vercel deployment (this is a local `tsx` script, not a deployed
    Function, so it can't rely on Vercel's runtime-native OIDC), to be
    documented in `docs/vercel-setup.md`. **Checked against real repo
    state, not just assumed:** `.env.local` already carries a
    `VERCEL_OIDC_TOKEN` from a prior `vercel env pull`/`vercel link`, so
    the Gateway might technically already be reachable locally without a
    new credential — but that token is short-lived and meant to be kept
    fresh by an active `vercel dev` session, a poor fit for a batch
    script that (per the re-run cost risk noted below) could run
    unattended for a long time. Provisioning a dedicated, stable
    `AI_GATEWAY_API_KEY` avoids the token expiring mid-run; this is the
    reasoning for preferring it over the token that's already present,
    not an oversight.

15. **Trial runs against a bounded sample precede any full-thread run.**
    Decisions 7, 8, and 10 all lean on model judgment for genuinely hard
    calls (nickname vs. real track name, system continuity, cross-author
    label attribution) that nothing in this design can validate short of
    actually running it and checking the output by hand — and a
    full-thread run is a real commitment to get wrong repeatedly while
    iterating. So extraction gets validated the same way step 33
    validated the scraper itself: against the last ~40 pages of the
    thread — `scripts/output/lejonklou-sample-tail/thread.json` is already
    scraped and available, no new scraping needed. A trial run means
    running the extraction CLI against that file, then manually auditing
    a meaningful fraction of the resulting `ready`/`needs_review`/
    `expired` candidates against the real source posts, specifically for
    the failure modes this design is most exposed to: wrong-but-confident
    track/system inference, incorrect cross-author label attribution, and
    candidates that expired when they shouldn't have (or vice versa).
    Only once a trial run's output holds up under that audit does a
    full-thread run make sense. This is validation of the *extraction
    approach*, run once or a few times while iterating — it doesn't
    replace step 37's per-candidate human approval, and it exercises
    decision 16's skip mechanism directly (re-running a trial after a
    fix should only reprocess what was actually deleted).

16. **Re-runs skip posts already accounted for on disk — the candidate
    files themselves are the checkpoint, no separate log.** Each
    candidate file gets a `contributing_posts: string[]` field — every
    post `post_url` that has been folded into it: its source
    (test-defining) post, every vote/reply post accepted for it, and its
    reveal post if closed. The same disk-read that already builds
    decision 10's shared index (across `pending/`, `needs_review/`,
    `ready/`, `approved/`, `ingested/*`, `expired/`) builds a second,
    cheap structure from the same pass: a `Set<post_url>` union of every
    candidate's `contributing_posts`. Walking the thread, a post is
    skipped (no `generateObject` call at all) only if it's already in
    that set; anything not found there — because it's genuinely new, or
    because a human deleted the file that used to account for it — gets
    processed fresh, with no special-casing between those two cases.

    **An empty `post_url` is never added to `contributing_posts`.**
    Decision 2's `unresolvable_post_id` fallback exists precisely because
    `post_url` can be `''` — and if that empty string were recorded as a
    "contributing post" like any other, it would poison the shared
    skip-set: a *second, unrelated* post that also happens to have an
    empty `post_url` (its own permalink extraction separately failing —
    rare, but the same class of event) would find `''` already in the
    set and get silently skipped, never evaluated at all. That's the
    exact "unrelated things silently merged" failure this decision and
    decision 2's fallback both exist to avoid, just arrived at from the
    other direction. So a post with no resolvable `post_url` simply gets
    no provenance entry — it stays permanently eligible for its
    `generateObject` call to re-run on every future run, rather than
    being trackable in the skip-set at all. That re-run isn't wasted
    effort forever, though: decision 2's fallback key is a content hash,
    not array position, so the same post resolves to the same
    `unresolvable-<hash>` filename each time — decision 4 correctly
    leaves it alone once a human has moved it to `approved/`, even
    though the LLM call keeps firing for it up to that point. Noisier
    than a clean skip while it's still pending, but it fails toward
    "keeps asking for attention" rather than "silently drops a different
    post," consistent with this design's default everywhere else.

    **This makes "delete a file to force re-extraction" work exactly as
    intended, because deletion is atomic per candidate.** Removing a
    candidate's file removes the *entire* record of everything that ever
    contributed to it in one move — its creation, every vote, its reveal
    — so a re-run correctly reprocesses that whole cluster of posts from
    scratch and nothing else; posts belonging to still-present candidates
    stay correctly skipped, since their own provenance lives in their own
    still-present files.

    **One real rough edge, accepted rather than solved:** decision 2
    lets a single post spawn more than one candidate (`pair-1`, `pair-2`,
    ...). Deleting only one pair's file doesn't fully "unprocess" the
    post — the skip-check is per-post, not per-pair, so that post gets
    reprocessed wholesale, regenerating every pair it originally
    produced, including ones nothing was wrong with. Reprocessing a
    sibling pair is cheap and expected to be idempotent (it should
    regenerate the same content), so this is accepted as documented
    behavior — multi-pair deletions should be done together — rather
    than building per-pair tracking within a single post for a rare
    case.

    **Not to be confused with step 33's own cache-deletion signal.**
    Deleting a candidate file only forces extraction to reprocess against
    whatever `lejonklou-thread.json` currently contains — if step 33's
    planned per-page cache still holds a stale version of the relevant
    page, "reprocessing" replays the same old content, not fresh content.
    To pick up a genuine live-forum change, both this file *and* step
    33's cached `raw/`/`parsed/` page files need clearing, not just one.

**Files to update:**
- `lib/ingestion/ingest-test-payload.ts` (existing, modified) — export
  `TUNE_METHOD_TECHNIQUE_NAME`; add `validateIngestPayload`'s optional
  third parameter, `knownTechniques?: string[]` (decision 13); no change
  to its existing single-argument call site in `app/api/internal/ingest/
  route.ts`.
- `lib/ingestion/extract/candidate.ts` (new) — candidate JSON shape:
  `IssueCode` union, `issues: IssueCode[]` plus free-text `notes?:
  string[]` (decision 1), `contributing_posts: string[]` (decision 16);
  the `pending`/`needs_review`/`ready`/`approved`/`ingested`/`expired`
  folder layout; read/move helpers that respect decision 4 (never touch
  a `source_ref` that already has a file in `approved`/`ingested`/
  `expired`); open/closed state read from a loaded candidate's own
  content (e.g. `before_is_a` populated), not replayed from
  `contributing_posts`.
- `lib/ingestion/extract/extract-post.ts` (new) — the `generateObject`
  call plus the deterministic wrapping around it (clip-health filtering
  via decision 12, technique hardcoding via `TUNE_METHOD_TECHNIQUE_NAME`,
  track-identification fallback, and a final `validateIngestPayload` call
  — decision 13 — before a candidate is marked `ready`). The model's Zod
  schema classifies a post's `role` (`test_defining`/`reveal`/`vote`/
  `irrelevant`); for `test_defining`, it describes `comparison_groups` of
  distinct *clips* (each with its own real forum label and system-state
  description), not pre-formed pairs — `buildPairsFromGroups` then
  deterministically decomposes each group into consecutive pairs
  (clip[0]-vs-clip[1], clip[1]-vs-clip[2], ...), giving every pair
  genuinely distinguishing `forum_labels` instead of a flat, colliding
  `['A','B']` (a real bug found and fixed via decision 15's trial run —
  see "Verified" below). A vote's schema also carries `target_creator`
  (which OPEN_CANDIDATES creator this vote is about), not just a bare
  label, since decision 10's cross-author fallback needs the creator to
  scope the label lookup — labels alone aren't unique across creators.
- `lib/ingestion/extract/source-ref.ts` (new) — parses the real phpBB
  post ID out of `post_url` via the same `/[?&]p=\d+/` pattern step 33
  already uses for `quoted_post_url`, to build decision 2's
  `<thread>:post-<n>:pair-<i>` key; never derives `n` from array
  position; falls back to a content-hash `unresolvable-<hash>` key
  (never array position — decision 2 explains why) and
  `'unresolvable_post_id'` (decision 1/2) when `post_url` is empty or has
  no parseable ID, rather than throwing or silently colliding two such
  posts on the same key.
- `lib/ingestion/extract/candidate-index.ts` (new) — decision 10's shared
  index: built from disk at startup, updated during the walk, queryable
  by `post_url`, by `(creator, forum_label)`, and by `creator`; owns the
  open/closed state per candidate (reveal-closes, 21-day expiry to
  `expired/`); also builds decision 16's `contributing_posts` skip-set
  from the same disk read, excluding empty `post_url` entries so two
  unrelated `unresolvable_post_id` candidates can never collide in it.
  `findOpenCandidateByCreatorLabel` also falls back to splitting a
  composite label (`"1/2"`, `"1 vs 2"`) into its parts and retrying each
  — a real fix, not speculative (finding 4 below).
- `scripts/extract-lejonklou.ts` (new) — CLI entrypoint: reads step 33's
  JSON, walks posts in thread order (chronological, not grouped by
  author — decision 10), building/updating candidates via the shared
  index.
- `package.json` — new `ai`/`zod` dependencies; new `extract:lejonklou`
  script.
- `.gitignore` — no change needed; `scripts/output/` already covers the
  candidates output location (human-edited working state, not committed
  source), same as it already covered the scraper's cache.
- `docs/vercel-setup.md` — new "Forum ingestion: `AI_GATEWAY_API_KEY`
  (local-script-only)" section: what it's for, how to provision it via
  the Vercel dashboard, and why it's added directly to `.env.local`
  rather than through the usual per-environment dashboard scopes
  (extraction never runs as a deployed Function) — plus the same
  stable-credential-vs-`VERCEL_OIDC_TOKEN` reasoning as decision 14.
- `.env.local` — `AI_GATEWAY_API_KEY` added (a human provisioned the key
  and a credit card/credits on the Vercel AI Gateway — both were
  required; a card alone still hit a free-tier rate limit on the first
  attempt, see "Verified" below).
- `core.md` / `testing.md` — test counts (34 files / 386 tests) and new
  inventory rows.
- `lib/ingestion/extract/candidate.ts` — added `broken/` to
  `CANDIDATE_STATUSES`/`STATUS_FOLDERS`/`PROTECTED_STATUSES` (finding 6).
- `lib/ingestion/extract/extract-post.ts` — `statusForCandidate` exported
  (finding 6, so `resolve-candidate-track.ts` can reuse it exactly).
- `scripts/resolve-candidate-track.ts` (new) — finding 6's per-candidate
  track-resolution tool.
- `scripts/default-before-is-a.ts` (new) — finding 6's batch
  reveal-never-matched override tool.
- `lib/ingestion/extract/candidate.ts` — `CandidateStatusValue` named-
  constant object replacing the `CANDIDATE_STATUSES` array literal
  (`CandidateStatus` now `(typeof CandidateStatusValue)[keyof typeof
  CandidateStatusValue]`); every status literal across this pipeline
  (`candidate.ts`, `candidate-index.ts`, `extract-post.ts`,
  `default-before-is-a.ts`, `recheck-clip-health.ts`) now reads from it
  instead of a bare string. Scope deliberately limited to `CandidateStatus`
  only, not `IssueCode` — a human instruction, not an oversight. Also adds
  `FATAL_CLIP_ISSUES` (finding 7).
- `lib/ingestion/extract/clip-health.ts` (new) — finding 7's thorough clip
  check, replacing the inline `isClipDead` helper that used to live in
  `extract-post.ts`. `checkClipStatus(url, postLinks)` combines
  `isRealPostLink` (catches a model-hallucinated clip URL not actually in
  the post — see finding 3's sibling issue) with `checkClipHealth`, which
  tightens decision 12's original reachability-only check into a real
  media check for `direct`-provider URLs, and returns `'unverifiable'`
  for `google-drive` URLs without any network call (finding 7 explains
  why).
- `lib/ingestion/extract/extract-post.ts` — `issueForClipStatus` maps
  `ClipHealthStatus` to the right `IssueCode`; `statusForCandidate` now
  checks `FATAL_CLIP_ISSUES` *before* the general "any issue ->
  needs_review" rule, routing straight to `broken` (finding 7).
- `lib/ingestion/extract/candidate-index.ts` — new `candidateByPostUrl:
  Map<string, string>` field on `CandidateIndex` (every contributing
  post's URL -> its candidate's `source_ref`, any status, not just open
  ones) and `isReplyToBrokenCandidate(index, quotedPostUrl)`, letting the
  walk skip a `generateObject` call entirely for a reply that directly
  quotes an already-`broken` candidate's post (finding 7).
- `scripts/extract-lejonklou.ts` — wires `isReplyToBrokenCandidate` into
  the main walk loop, alongside decision 16's existing
  `isPostAccountedFor` skip; logs a separate `skippedBroken` count.
- `scripts/recheck-clip-health.ts` (new) — a standalone, non-LLM
  retroactive sweep for candidates extracted before finding 7's thorough
  check existed. Re-derives clip health directly from each candidate's
  stored `clip_a_url`/`clip_b_url` rather than re-running extraction;
  only ever touches `pending/`, `needs_review/`, and `ready/` (the
  non-protected statuses), same protection principle as everywhere else
  in this pipeline.

**Tests:**
- **Unit:** candidate status-transition logic (new candidate → `pending`;
  becomes `ready`/`needs_review` once complete; re-running never
  regresses an `approved`/`ingested`/`expired` candidate); the shared
  candidate index (all three lookup keys; `post_url` resolves for every
  post attributed to a candidate, not just its originating post; a
  reveal closes its candidate to further matching; a still-open
  candidate expires to `expired/` at 21 days measured from its own post
  timestamp, not wall-clock; a candidate whose own post has no timestamp
  goes to `needs_review` with `issues: ["missing_timestamp"]` instead of
  entering expiry tracking at all); decision 16's skip mechanism (a post
  already present in some candidate's `contributing_posts` is skipped —
  no `generateObject` call; deleting a candidate file makes every post
  that contributed to it eligible for reprocessing again; a multi-pair
  post with only one sibling pair's file deleted reprocesses the whole
  post, regenerating every pair; a skipped post still advances the
  walk's expiry clock, so a candidate expires correctly even when every
  post in its window was skipped on a resumed run; two different posts
  that both have an empty `post_url` are never conflated — neither ever
  enters `contributing_posts`, so both stay eligible for reprocessing on
  every run rather than one silently skipping because of the other);
  the typed `issues`
  shape (every needs_review-triggering path adds the right `IssueCode`,
  never a raw string; `validateIngestPayload` failures land in `notes`,
  not `issues`); `source-ref.ts`'s post-ID parsing (extracts the real
  numeric ID from a realistic `post_url`, stable regardless of the
  post's position in the array — never falls back to array position for
  a normal post; an empty or unparseable `post_url` gets a content-hash
  `unresolvable-<hash>` fallback key and `'unresolvable_post_id'` —
  never array position; two different posts that both lack a
  `post_url` get two different hashes, never colliding; the same post's
  hash is identical across runs regardless of where it sits in the
  array); track-identification
  fallback (produces a unique placeholder per `source_ref`, never a shared
  one); the clip-health filter (thin wrapper over already-tested
  `detect-provider`/`check-url` — just confirm correct usage, only
  `direct` links get a real check per decision 12); `validateIngestPayload`'s
  new `knownTechniques` parameter (rejects a vote whose `technique_name`
  isn't in the list when passed; unchanged behavior when omitted, so the
  existing ingest-route tests keep passing unmodified); a pinned test
  asserting `TUNE_METHOD_TECHNIQUE_NAME === 'Tune Method'` against the
  real seed row in `20260625094142_initial_schema.sql`; Zod schema
  validation itself. The `generateObject` call is mocked in these tests —
  the model call itself isn't unit-testable in the traditional sense.
- **E2E / integration:** none — no deployed route is touched.
- **Manual (not automated):** decision 15's trial run — extract against
  `scripts/output/lejonklou-sample-tail/thread.json` (the last ~40 pages,
  already scraped), then hand-audit a meaningful fraction of the
  resulting `ready`/`needs_review`/`expired` candidates against the real
  source posts before a full-thread run is attempted. **Done — twice**
  (once before findings 3/4's fixes, once after); see findings 3-5 above
  for what it found and "Verified" below for the final numbers.

**Verified:** `npm run test` — 35 files / 405 tests, all passing (83 new
relative to step 33's 322: 4 in the existing `ingest-test-payload.test.ts`,
19 more across four new `lib/ingestion/extract/__tests__/*.test.ts` files
from finding 6's work, including regression tests for findings 3 and 4;
one new `clip-health.test.ts` file plus additions to `extract-post.test.ts`
and `candidate-index.test.ts` from finding 7 below). `npx tsc --noEmit` —
no new errors (same pre-existing, unrelated `__tests__/supabase-*.test.ts`
failures as every prior step).

**Five real findings from actually building this, not caught by any prior
review pass:**

1. **A genuine bug, found and fixed by the tests themselves:**
   `statusForCandidate`'s first draft called `validateIngestPayload`
   unconditionally and treated *any* failure as `'invalid_payload'` —
   which meant every ordinary not-yet-revealed candidate (the normal
   state for most of its life, since `before_is_a` legitimately doesn't
   exist until a reveal arrives) got flagged as if something were wrong
   with it. Fixed: a candidate with no other issues and no `before_is_a`
   yet is simply `pending` — `validateIngestPayload` (and thus
   `'invalid_payload'`) only ever runs once a reveal has actually set
   `before_is_a`.
2. **Decision 16's skip-set structurally cannot cover `irrelevant`
   posts, discovered only while implementing it, not during any review
   pass.** `contributing_posts` lives *inside* a candidate file — but an
   `irrelevant` post (the majority of posts in this thread, per earlier
   sampling) never contributes to any candidate at all, so it never gets
   a provenance entry anywhere. That means every `irrelevant` post is
   re-classified (a real `generateObject` call) on *every* future run,
   full-thread or trial — decision 16 only actually saves cost for posts
   that end up attached to a candidate (test-defining, reveal, vote).
   Deliberately not "fixed" with a separate log — that would directly
   contradict decision 16's own "no separate log, candidate files are
   the only checkpoint" principle for the sake of optimizing the
   majority-case posts it was never designed to cover. Left as an
   accepted, now-documented limitation rather than solved unilaterally;
   worth real cost numbers from the trial run below before deciding if
   it's worth revisiting.
3. **A real bug found by decision 15's own trial run against real data,
   not by any unit test:** the model's Zod schema originally had it
   describe pre-formed pairs directly, each getting a flat, generic
   `forum_labels: ['A', 'B']`. Two posts in an 8-post smoke sample
   (a 3-clip and a 5-clip chained comparison, both single-creator,
   single-post) immediately exposed the consequence: every pair from the
   same post shared the same `(creator, label)` key in
   `candidate-index.ts`'s map, so each `saveCandidate` call silently
   overwrote the previous pair's entry — only the *last* pair of a
   multi-pair post was ever reachable via the bare-label fallback.
   **Fixed by changing what the model describes, not by patching the
   index:** the schema now has the model list distinct *clips* (each
   with its own real forum label, or a positional fallback) grouped into
   comparison groups, and deterministic code (`buildPairsFromGroups`)
   decomposes each group into consecutive pairs — clip[0]-vs-clip[1],
   clip[1]-vs-clip[2], etc. — so every pair carries its own genuinely
   distinguishing labels. Reconfirmed against the same two real posts
   after the fix: `springwood64`'s 3-clip post now yields
   `['Brasso','Brassic']` and `['Brassic','Air']`; `lejonklou`'s 5-clip
   post yields `['1','2']`, `['2','3']`, `['3','4']`, `['4','5']`
   (the model fell back to positional numbering, matching the clips'
   own `1.MOV`–`5.MOV` filenames, since nothing else was named). This
   also surfaced a real, *irreducible* ambiguity distinct from the bug:
   a shared middle label in a chain (`'Brassic'` belongs to both
   adjacent pairs) can't be fully disambiguated from a bare label alone
   — genuine source-material ambiguity, not something to solve further.
   (It doesn't actually get flagged `'ambiguous_attribution'` today — see
   finding 5.)
4. **A second real bug, found by the *full* 978-post trial run (not the
   earlier 8-post smoke sample) — the model echoing `candidateSummary`'s
   own display format back as a match target.** `lejonklou`'s real
   5-clip reveal (post 72339, one day after its 4-pair test-defining
   post) failed to match *any* of its 4 candidates on the first full
   run — a genuine bug, not the accepted middle-label ambiguity above.
   Diagnosed by replaying the exact 89-post prefix leading up to it with
   temporary logging: the model returned `target_forum_label` values
   like `"1/2"`, `"2/3"` — copying the composite `forum_labels=1/2`
   format `candidateSummary` uses to *display* a pair's two labels in
   the OPEN_CANDIDATES context, rather than picking one of the two
   individual clip labels the matching code actually needs. **Fixed on
   the lookup side, not just the prompt:** `findOpenCandidateByCreatorLabel`
   now falls back to splitting a composite label on common separators
   (`/`, `vs`, `-`, `and`, `&`) and retrying each part, since natural-
   language phrasing varies regardless of how precisely the schema is
   worded (the schema description was also tightened, as a first line of
   defense, not a substitute for the robust fallback). Reconfirmed
   against the same real 89-post prefix: 3 of the 4 reveal entries now
   match correctly (the 4th lands on finding 3's already-accepted
   shared-middle-label ambiguity, not a new failure).
5. **`'ambiguous_attribution'` is a defined `IssueCode` that the real
   code never actually sets — found by auditing the full 978-post trial
   run's output, not by a unit test.** Every real `needs_review`
   candidate in the trial carries `unidentified_track` and nothing else;
   `'ambiguous_attribution'` never appears once. The reason: when a
   label lookup could plausibly match more than one open candidate
   (finding 3's shared-middle-label case), the current code doesn't
   detect that ambiguity at all — `findOpenCandidateByCreatorLabel`
   (and its `Map`-based index) only ever returns *one* candidate,
   whichever last-write-wins happened to leave there, with no signal
   that another candidate was equally plausible. So genuine multi-
   candidate ambiguity resolves silently today, rather than being
   flagged for a human to look at, which is what decision 10 originally
   intended `'ambiguous_attribution'` for. **Documented as a known,
   accepted gap, not fixed** — the real-world impact observed so far is
   narrow (it affected 1 of 4 pairs in the one chained-sequence example
   found in this trial), and closing it properly means changing the
   lookup to detect and report multiple matches, which is a real design
   change to `candidate-index.ts`, not a quick patch — left for a
   deliberate follow-up rather than a reactive fix.

   **Full second trial run, after fixes 3 and 4 above, for the record:**
   978 posts → 104 candidates (1 `ready`, 23 `needs_review` — all
   `unidentified_track` only, no dead links/missing timestamps/
   unresolvable IDs/invalid payloads — 80 `expired`). 87 reveal/vote
   posts (16 reveal, 71 vote) still didn't match anything; sampling
   several against real source text found them to be *correct*
   rejections, not bugs — votes cast literally the day after their
   test's own reveal (correctly excluded as non-blind, decision 10), or
   referencing a test whose defining post falls outside this 40-page
   window (an inherent bounded-sample limitation, not a defect). Spot
   checks against real text found genuinely high-quality output: a real
   track ("Henri Texier – Annobon") correctly identified with two
   plausible votes attached; a single post describing three independent
   tracks correctly split into three separate candidates with their
   real, non-colliding labels (`A1/B1`, `A2/B2`, `A3/B3`), each
   correctly scoped to only the votes that actually discussed it.

6. **Human-review tooling, built during the actual post-trial review
   (not anticipated in the original plan), plus a new status decision 3
   didn't originally have.** Manually reviewing the trial's real
   `needs_review`/`expired` output surfaced two concrete needs:
   - `scripts/resolve-candidate-track.ts <candidate-json-path> <artist>
     <title>` — automates the mechanical part of decision 7's manual
     track-resolution workflow: set the real track, clear
     `unidentified_track`, recompute status via the same
     `statusForCandidate` extraction itself uses (now exported), and
     move the file if that was the only thing outstanding.
   - `scripts/default-before-is-a.ts <candidates-dir>` — a batch human
     override for candidates whose reveal never matched at all (as
     opposed to matching incorrectly, findings 3/4's territory):
     defaults `before_is_a: true` for every candidate in `needs_review/`
     and `expired/` that doesn't already have a real boolean value,
     recomputes status, and moves accordingly. Deliberately bypasses
     `candidate-index.ts`'s `saveCandidate` (which throws on a move out
     of a protected status) in favor of `candidate.ts`'s lower-level
     `writeCandidate`/`deleteCandidate` directly — the same pattern
     `resolve-candidate-track.ts` already established — since a human
     overriding an automated `expired/` determination is exactly the
     case decision 4's protection exists to defer to a human, not
     something the automated walk should ever do to itself.
   - **A new `broken/` status** (decision 3), added after manually
     checking every candidate that had ended up in `expired/` and
     finding their clip URLs genuinely dead. Distinct from decision 12's
     `dead_clip_url`: that only ever catches a `direct`-provider link
     failing its HEAD check *at extraction time* — a youtube/vimeo/
     google-drive link is trusted by URL shape alone (decision 12's own
     accepted limitation) and a link that goes dead *after* extraction
     has no automated check at all. `broken/` is protected the same way
     `approved/` is — nothing writes there automatically, only a human,
     and a re-run can't silently reverse the determination.

   One real, human-caught near-miss during this process, worth recording
   precisely because it *wasn't* a code bug: two revealed (real,
   correctly-matched `before_is_a`) candidates were briefly suspected of
   being another candidate-index bug — a revealed candidate sitting in
   `expired/` looks exactly like decision 10's "closed candidates are
   immune to expiry" invariant being violated. They turned out to be
   manual misfilings by the human reviewer while browsing the output,
   not a bug — moved back to `needs_review/` once clarified. Diagnosing
   this consumed real investigation effort (isolated replay of the exact
   post sequence with temporary logging) before the explanation arrived;
   worth noting as a reminder that "looks exactly like a known bug
   pattern" isn't the same as "is that bug."

7. **A more thorough clip-health check, token-saving fatal-issue routing,
   a retroactive sweep script, and a real limitation found while building
   it — all from continued manual review of finding 6's `broken/`
   candidates.** Manually checking every clip in `broken/` found three
   distinct failure shapes decision 12's original check never caught,
   since it only ever checked reachability (`url_status`), never whether
   the response was actually playable media: a missing clip URL on a
   comparison group, a clip URL that doesn't resolve to media (a Dropbox
   preview page, a Google Photos share link, an iCloud share link — all
   return a healthy `200 text/html`, all fall into `detectProvider`'s
   generic `direct` bucket since none match the youtube/vimeo/
   google-drive patterns), and a genuinely dead link. `checkClipHealth`
   now checks `media_type` as well as `url_status` for any `direct` link,
   catching all three uniformly with one tightened check — no
   provider-specific special-casing needed. A Dropbox `dl=0` -> `dl=1`
   URL-rewrite fix was considered and rejected: verified against real
   broken examples (both HEAD and GET) that it doesn't change the
   response at all.

   Two new non-fatal-adjacent `IssueCode`s were added for this
   (`missing_clip_url`, `unplayable_clip_url`), joining `dead_clip_url` in
   a new `FATAL_CLIP_ISSUES` set — issues a human can't fix by editing the
   candidate file, since the clip itself is unusable. A candidate carrying
   any of them now routes straight to `broken` in `statusForCandidate`,
   checked *before* the general "any issue -> needs_review" rule, closing
   it to further matching immediately. This directly enables a token
   saving: `isReplyToBrokenCandidate` lets the walk skip the
   `generateObject` call entirely for a reply that directly quotes an
   already-`broken` candidate's post — there's no point spending tokens
   figuring out a vote for a test nobody can ever actually watch. This
   only catches *direct* quotes of a broken candidate's own contributing
   posts; a reply-to-a-reply chain with no quote at all still gets a real
   classification call, same as any other bare-label reference (decision
   10's existing fallback).

   **A real, curl-verified limitation found while building the
   retroactive sweep, that reversed an in-flight decision:** the original
   plan (per a human's explicit choice) was to add a real network check
   for `google-drive` URLs too, the same way `direct` URLs already get
   one. Building it turned up a hard technical wall: a confirmed-broken
   (deleted) Drive file id and a still-unreviewed one both returned an
   *identical* anonymous 404 "Page not found" page — tried `/preview`,
   `/view`, and the `uc?export=download` redirect chain, with and without
   a browser User-Agent, all four combinations identical for both file
   ids. Zero `drive.google.com` links exist anywhere in `ready/` either,
   so there was no confirmed-healthy example to compare against. Google
   Drive's file endpoints require a real signed-in browser session to
   render; an unauthenticated automated request can't distinguish a dead
   file from a healthy one, so a network check would flag *every* Drive
   link as broken, healthy or not. Brought back to a human for a decision
   rather than shipped anyway: settled on a third path — `checkClipHealth`
   returns a new `'unverifiable'` status for any `google-drive` URL,
   mapped to a new non-fatal `unverifiable_clip_url` IssueCode, which
   routes to `needs_review` (not `broken`) so it surfaces for a human to
   check by hand, same as the workflow already in use for
   `unidentified_track`.

   `scripts/recheck-clip-health.ts` re-derives clip health directly from
   each candidate's stored clip URLs — a purely deterministic operation —
   rather than re-running the expensive LLM-backed extraction pipeline
   just to redo a network check. Run for real against the actual
   `scripts/output/candidates/` repository: 83 candidates moved or
   updated out of `pending`/`needs_review`/`ready` (`pending` and `ready`
   both empty going in/out), `broken/` grew from 43 to 52 (previously
   undetected non-media-page and missing-URL cases), and 32 of the 34
   candidates left in `needs_review/` carry the new
   `unverifiable_clip_url` issue — the google-drive links the retroactive
   sweep can only flag for a human, not resolve itself.

   This deliberately does not touch `lib/clips/detect-provider.ts` /
   `check-url.ts` — the same functions `POST /api/clips/verify` and the
   live app's player use — so live-app behavior for a human submitting a
   URL there (who has already confirmed it plays) is unaffected; this is
   an extraction-only tightening, wrapping the same primitives rather
   than changing them.

---

## ✅ 36 — Commit

**The gap this closes:** approved candidates need to actually reach the
app. This is the only step in the whole pipeline that makes a real HTTP
call to a deployed environment — deliberately separated from extraction
(step 35) since it has none of extraction's uncertainty: no LLM, no
judgment calls, nothing to review.

**Decisions:**

1. **A single script, parameterized by target environment, reading a
   different source folder per environment — enforcing "staging first" at
   the tooling level, not just as a documented convention.** `scripts/
   commit-lejonklou.ts --env staging|production` (base URL resolved per
   decisions 5/6 below), using
   `CandidateStatusValue.APPROVED`/`.INGESTED_STAGING`/
   `.INGESTED_PRODUCTION` (never a raw `'approved'`/`'ingested_staging'`/
   `'ingested_production'` string literal, matching step 35's constants
   refactor):
   - `--env staging` reads every file in `approved/`, POSTs each to
     `<base-url>/api/internal/ingest`, and moves successes to
     `ingested/staging/`.
   - `--env production` reads every file in `ingested/staging/` —
     **not** `approved/`. This is the fix for an earlier version of this
     plan, which had both environments reading from `approved/`: since a
     successful commit moves a file out of its source folder, staging
     would have drained `approved/` before production ever ran. Chaining
     production's input to staging's output instead means a candidate
     physically cannot reach production without having already been
     committed to staging first — and it also means production always
     ships *exactly* the set staging verified, even if more scraping/
     extraction happens in between (new candidates land in `pending/`/
     `needs_review/`/`ready/`, never in `ingested/staging/`, so they
     can't reach production via this script no matter what).
   - On success, `--env production` moves the file to
     `ingested/production/` — the terminal state.

   **A real gap, found by checking against `candidate.ts` rather than
   assumed:** `approved` is a flat top-level folder, but
   `ingested_staging`/`ingested_production` map to the *nested*
   `ingested/staging`/`ingested/production` folders (`STATUS_FOLDERS` in
   `lib/ingestion/extract/candidate.ts`) — and that mapping is private,
   never exported. `readAllCandidates` only ever reads every folder
   together, never one status in isolation, so there is currently no way
   for a new script to correctly list "every file in `ingested/staging/`"
   without either duplicating the nested-path knowledge (risking exactly
   the mismatch `recheck-clip-health.ts` avoided only because its three
   folders — `pending`/`needs_review`/`ready` — all happen to be flat) or
   a small `candidate.ts` addition. **Resolved as part of decision 4
   below**, not deferred to build time.
2. **A non-2xx response leaves the file in its current source folder**
   (`approved/` for a staging attempt, `ingested/staging/` for a
   production attempt) via `writeCandidate` (content changes, status
   doesn't — never `moveCandidate`, and never `saveCandidate`, which
   isn't part of this walk). The real route's error body is a free-text
   message (`{ error: string }` — see `app/api/internal/ingest/
   route.ts:60,110`), not one of a fixed set of codes, so per step 35
   decision 1's typed-issues/free-text-notes split it belongs in `notes`,
   not `issues` — `issues` stays reserved for the enum `IssueCode` union.
   Retried on the next run rather than silently lost.
3. **Idempotent by construction, independent of this script's own
   bookkeeping.** Even if `commit-lejonklou.ts` is run twice for the same
   candidate and environment, `ingest_test`'s `source_ref` uniqueness
   means a repeat POST just returns `alreadyImported: true` in the JSON
   response (confirmed against the real route and `api-conventions.md`'s
   documented contract — `already_imported` is only the internal Postgres
   RPC field name, not what the HTTP response actually carries) rather
   than duplicating — moving the file is a convenience, not the safety
   mechanism.
4. **A small new `lib/ingestion/commit.ts`, not "no new library code" —
   matching the pattern every other step already established** (`extract-
   post.ts`/`extract-lejonklou.ts`, `create-placeholder-author.ts`/the
   route that calls it): real logic lives in `lib/`, `scripts/*.ts` stays
   a thin argv-parsing wrapper. None of the five existing pipeline scripts
   (`scrape-lejonklou.ts`, `extract-lejonklou.ts`,
   `resolve-candidate-track.ts`, `default-before-is-a.ts`,
   `recheck-clip-health.ts`) has its own test file — all tested logic
   lives in `lib/`, and there's no reason for this step to be the first
   exception. `lib/ingestion/commit.ts` exports:
   - `listCandidatesInStatus(baseDir, status)` — a new, single-status
     reader added to `candidate.ts` alongside the existing
     `readAllCandidates` (which reads every folder together and is wrong
     for this use), correctly resolving the nested `ingested/staging`/
     `ingested/production` paths since it shares `filePathFor`'s
     already-correct resolution instead of a second, independent
     implementation of it — this is what actually closes decision 1's
     gap above.
   - `commitCandidate(baseUrl, secret, candidate)` — POSTs one candidate
     to `/api/internal/ingest` and returns the parsed `{ testId,
     alreadyImported }` or `{ error }` shape.
   - `commitEnvironment(baseDir, baseUrl, secret, env)` — the per-
     environment loop: source/destination status pair, calls the two
     functions above, calls `writeCandidate`/`moveCandidate` for the
     success/failure paths per decision 2.
   `scripts/commit-lejonklou.ts` becomes argv parsing plus one call to
   `commitEnvironment`.
5. **`--env` is a required CLI argument with no default — the one choice
   that must never be implicit.** `tsx scripts/commit-lejonklou.ts --env
   staging`. Defaulting it would risk an accidental run against the wrong
   environment. The base URL and the ingest secret are *not* CLI
   arguments — a secret shouldn't appear in shell history or `ps` output,
   and (revised after the initial build — see decision 6) retyping the
   right URL by hand every run is itself an error opportunity a per-
   environment env var removes. `--base-url <url>` remains available as
   an explicit one-off override (e.g. a specific preview deployment)
   without touching `.env.local`, but there's no bare positional URL
   argument — only a named flag, so it can never be confused with the
   optional trailing `candidates-dir` positional argument regardless of
   argument order.
6. **Two separate local env vars per concern, one per environment — never
   a single ambient value.** `docs/vercel-setup.md` (Production-scope and
   Preview-scope tables) confirms staging and production are provisioned
   with *different* `INGEST_SECRET` values on Vercel; `.env.local` can
   only hold one value per key name, and step 37 explicitly runs staging
   then production as one continuous session — a single `INGEST_SECRET`
   name would force editing `.env.local` between the two commands, which
   is exactly the accidental-wrong-environment risk decision 5 exists to
   remove. `commit-lejonklou.ts` reads `INGEST_SECRET_STAGING`/
   `INGEST_SECRET_PRODUCTION` and, the same way, `COMMIT_BASE_URL_STAGING`/
   `COMMIT_BASE_URL_PRODUCTION` (added after the initial build, once real
   staging/production URLs — `https://staging.audiophile-compare.uk` and
   `https://audiophile-compare.uk` — existed to put somewhere), based on
   `--env` (all four can be populated in `.env.local` at once).
   `docs/vercel-setup.md`'s local-dev guidance has a section for all four
   names.
7. **No new dependencies beyond what steps 33 and 35 already
   established.** `tsx` as the runtime (step 33); the built-in global
   `fetch` for the POST (no HTTP client library); Node's built-in
   `fs/promises`, via the new `listCandidatesInStatus`, for listing a
   folder and `rename()`-ing a file into its destination on success (a
   same-filesystem rename is atomic — no separate copy-then-delete
   needed); `process.loadEnvFile()` to read `.env.local` for the two
   secret vars, the same pattern already used by `extract-lejonklou.ts`
   (step 35), `playwright.config.ts`, and `vitest.integration.config.ts`.

**Files to update:**
- `lib/ingestion/extract/candidate.ts` — new exported
  `listCandidatesInStatus(baseDir, status)` (decision 4).
- `lib/ingestion/commit.ts` (new) — decision 4's `commitCandidate`/
  `commitEnvironment`.
- `scripts/commit-lejonklou.ts` (new) — thin CLI wrapper.
- `package.json` — new `commit:lejonklou` script.
- `docs/vercel-setup.md` — add `INGEST_SECRET_STAGING`/
  `INGEST_SECRET_PRODUCTION` local-dev guidance (decision 6); the existing
  per-environment Vercel-dashboard `INGEST_SECRET` provisioning (Production/
  Preview scope tables) is unaffected — this only concerns how the two
  values reach a local `.env.local` for this script's own use.
- `api-conventions.md` — the existing "Forum ingestion pipeline" section
  (documents the route/idempotency/security contract already) gains a
  line noting `commit-lejonklou.ts` as the route's only caller and the
  staging-then-production folder-chaining safety design.
- `core.md` / `testing.md` — per the usual pattern, once built.

**Tests:**
- **Unit (`lib/ingestion/__tests__/commit.test.ts`):** given a fixture
  directory tree (temp folder, not the real `scripts/output/` path) with
  files spread across `approved/`, `ingested/staging/` (confirming the
  nested path resolves correctly — decision 1's gap), and other folders:
  `commitEnvironment(..., 'staging')` only reads files from `approved/`
  and moves successes to `ingested/staging/`, ignoring anything already
  there; `commitEnvironment(..., 'production')` only reads files from
  `ingested/staging/` (confirms it never touches `approved/`, even when
  `approved/` still has entries) and moves successes to
  `ingested/production/`; a non-2xx response leaves the file in its
  source folder via `writeCandidate`, with the error appended to `notes`
  (never `issues`) rather than silently dropped; a response with
  `alreadyImported: true` is still treated as success and still moves the
  file (decision 3 — idempotent, not an error). `fetch` is mocked — no
  real network call, no live Supabase/Vercel dependency.
  `listCandidatesInStatus` itself gets covered alongside `candidate.ts`'s
  other status-folder tests in `candidate.test.ts`, same file as
  `readAllCandidates`'s existing coverage.
- **E2E / integration:** none beyond what step 31 already has for the
  ingest route itself. `scripts/commit-lejonklou.ts` itself stays
  untested directly, matching every other CLI script in this pipeline —
  its only job is argv parsing plus one call into `lib/ingestion/
  commit.ts`.

**Verified:** `npm run test` — 36 files / 424 tests, all passing (19 new:
10 in the new `lib/ingestion/__tests__/commit.test.ts`, 3 more in
`candidate.test.ts` for `listCandidatesInStatus`). `npx tsc --noEmit` — no
new errors (same pre-existing, unrelated `__tests__/supabase-*.test.ts`
failures as every prior step). `scripts/commit-lejonklou.ts`'s own argv
validation manually exercised (no args, an invalid `--env` value, and a
valid invocation with no secret set) — all three fail with the intended
message and a non-zero exit code, confirmed by real invocation, not just
reading the code.

**A real bug found only by exercising `parseArgs` directly, after the
initial build, once `--base-url` and the two `COMMIT_BASE_URL_*` env vars
were added (decisions 5/6):** the first version computed each flag's
"consumed" argv indices as `[envIndex, envIndex + 1, baseUrlIndex,
baseUrlIndex + 1]`, filtering out only genuinely negative values before
building the exclusion set. That looks right but isn't: when `--base-url`
is absent, `baseUrlIndex` is `-1`, and `-1 + 1 = 0` — a value that passes
an `>= 0` filter exactly as validly as a real index 0 does. The practical
effect: any time the `candidates-dir` positional argument happened to sit
at index 0 (i.e. *before* `--env` on the command line, e.g. `tsx
commit-lejonklou.ts my-dir --env staging`), it was silently swallowed and
the default `scripts/output/candidates` was used instead — no error, no
warning, just a quietly wrong directory. Caught by directly testing
`parseArgs` against six real argument orderings, not by reading the code
or by the type checker (both index values are legitimately `number`).
Fixed by gating each flag's pair of indices on that flag's own found-ness
(`envIndex >= 0`/`baseUrlIndex >= 0`) before ever computing `+ 1`, not by
filtering the already-computed values afterward — re-verified against the
same six orderings, including the originally-broken
positional-before-`--env` case.

**A real bug found on the first actual run against real staging — every
one of 44 candidates failed with the useless message "commit failed —
[object Object]".** Root cause: `staging.audiophile-compare.uk` sits
behind Vercel Deployment Protection (SSO), the same protection
`playwright.config.ts`/`e2e/helpers/auth.ts` already work around for the
E2E suite via an `x-vercel-protection-bypass` header — but
`commitCandidate`'s `fetch` call never sent it. Every request was
intercepted by Vercel's protection layer before ever reaching
`/api/internal/ingest`, and Vercel's own challenge response has a truthy
but non-string `error` field, which the original `body.error ?? ...`
logic passed straight through into a template literal, silently
stringifying to `"[object Object]"` instead of anything actionable.
Three fixes together, not just the one-line header:
1. `commitCandidate` now sends `x-vercel-protection-bypass:
   ${VERCEL_AUTOMATION_BYPASS_SECRET}` whenever that env var is set
   (already present in `.env.local` for E2E) — the actual fix for this
   failure.
2. A new `extractErrorMessage` helper never trusts `body.error` is a
   string just because the field exists — stringifies a non-string error
   value instead of silently producing `"[object Object]"` again the next
   time something unexpected returns a differently-shaped error body.
3. `commitCandidate` no longer lets `response.json()` (or `fetch` itself)
   throw uncaught — wrapped in try/catch, returning `{ error }` like any
   other failure mode. The original version didn't do this, which meant
   the *entire batch* of 44 candidates would have aborted after the
   first one if the protection response hadn't happened to be valid
   JSON — found by inspection while fixing (1)/(2), not by another real
   failure, but a real robustness gap regardless: one candidate's bad
   response should never take down every other candidate's chance to
   commit.

Six new tests cover all three (non-string error stringified, not
`"[object Object]"`; bypass header sent only when the env var is set;
`fetch` rejection and a JSON-parse failure both become `{ error }` results
without throwing; a `commitEnvironment`-level test confirms one candidate's
network error doesn't stop the next candidate from still committing
successfully) — `lib/ingestion/__tests__/commit.test.ts` is now 16 tests
(was 10).

Re-run against real staging with the fix applied: all 44 candidates
committed successfully (`approved/` emptied, all 44 moved to
`ingested/staging/`). Confirms the bypass-header fix was the actual root
cause — see finding 8 below for what a subsequent manual review of that
real committed data turned up.

**Finding 8 — three real bugs and one real gap found by manually
reviewing the 44 real committed tests on staging, not by any test or
review pass:**
1. Every imported test was inserted `status='open'`, never `'revealed'`,
   regardless of vote count — `ingest_test` hardcoded the literal. Since
   `tests.status === 'revealed'` is what actually gates the before/after
   mapping and vote tally being visible (`app/tests/[id]/page.tsx:44`)
   *and* what blocks new voting (`app/api/votes/route.ts:47-50`, 409
   "Cannot vote on a revealed test"), every one of the 44 historical tests
   was silently open to a live visitor casting a fresh vote on a
   years-old forum clip — not just a display bug.
2. `tests.created_at` always defaulted to `now()` — the real forum post
   date already existed as `Candidate.created_at` locally but was never
   included in `candidate.payload`, so it never reached the payload
   `IngestPayload` had no field for in the first place.
3. The public feed's apparent "wrong order" turned out not to be a
   second bug: `app/page.tsx:37` already does
   `.order('created_at', { ascending: false })` correctly. Once every
   imported test's `created_at` was "now" (bug 2), all 44 shared
   near-identical timestamps and sorted effectively at random relative to
   each other — fixing bug 2 fixes this for free, confirmed by re-running
   the full delete-and-recommit cycle described below rather than assumed.
4. Pagination (`app/page.tsx`) never had First/Last links, only
   Previous/Next — a real gap, not a regression, straightforward to add.
   Not itself forum-ingestion-specific, but documented here since that's
   where it was found; no automated test exists for it (no E2E fixture
   with >20 seeded tests exists yet to exercise pagination at all).

Fixed: a new migration
(`20260709110700_ingest_test_reveal_and_date.sql`) makes `ingest_test`
compute `status`/`revealed_at` from whether the payload's `votes` array is
non-empty (revealed with `revealed_at = now()` if so, `'open'` otherwise —
the real forum reveal date isn't separately tracked, only the
test-defining post's own date is) and accept an optional `created_at`,
falling back to `now()` exactly as before when absent (so a web-created
test, which never sets it, is unaffected). `IngestPayload` gained an
optional `created_at` field; `applyTestDefining` (`extract-post.ts`) now
populates it from `candidate.created_at`, guarding against the empty
string the `missing_timestamp` path can leave there (would otherwise fail
`validateIngestPayload`'s new "must be a valid date string" check).
`app/page.tsx` gained First/Last links (new `firstPage`/`lastPage` keys in
`messages/en.json`, alongside the existing `previousPage`/`nextPage`).

Decided (rather than assumed) to fix `ingest_test` once and
delete-and-recommit the 44 existing tests, instead of also writing a
separate retroactive `UPDATE` for the already-committed rows — one code
fix covers both bugs 1 and 2 at once via a fresh commit, since deletion
was needed anyway (see step 38 below, built ahead of its formal turn to
make that recommit cycle possible).

**Finding 9 — the delete-and-recommit cycle above still didn't fix either
bug on the first attempt, for two different real reasons, both found by
the same human re-reviewing the recommitted data:**

1. **A self-inflicted regression: `source_url` disappeared from the test
   detail page entirely — and the first attempt at fixing it broke `db
   push` too.** Finding 8's migration
   (`20260709110700_ingest_test_reveal_and_date.sql`) was written by
   copying the function body straight from
   `20260707150400_ingest_test_function.sql` — the *original*
   `ingest_test`, not realizing a later migration,
   `20260707173905_tests_source_url.sql` (step 32), had already layered
   `source_url` support on top of it. `create or replace function`
   replaces the whole body, so finding 8's migration silently deleted
   `source_url` handling the moment it was applied. First fix attempt
   edited `20260709110700` in place to add `v_source_url`/`source_url`
   back — which did nothing on the next `supabase db push`, since that
   migration's version was already recorded as applied on staging
   (confirmed via `supabase migration list`: `20260709110700` shown as
   both `local` and `remote`) — `db push` only applies versions the
   remote doesn't already have, it never diffs or re-runs one it thinks
   already succeeded, so a local-only content edit after the fact is
   invisible to it. Actually fixed by reverting `20260709110700` back to
   exactly what was really applied (so the file matches staging's real
   history) and adding a new migration,
   `20260709114200_ingest_test_restore_source_url.sql`, with the
   corrected function body — the general lesson, not just this one
   instance: **never edit a migration file once its version might already
   be applied anywhere; always add a new one, and check with `supabase
   migration list` first if genuinely unsure.**
2. **The `created_at` fix genuinely worked in the code, but had nothing
   real to work with yet.** All 44 real candidate JSON files on disk were
   extracted *before* today's `extract-post.ts` change that populates
   `payload.created_at` — that fix only affects a candidate built by a
   *future* extraction run, not files already sitting in
   `ingested/staging/` from a run months ago. So every one of the 44
   recommitted payloads still had no `created_at` at all, and
   `ingest_test` correctly (and silently) fell back to `now()` exactly as
   designed — not a bug in the fix itself, but a real gap in what
   "fixing extraction" actually covers. Confirmed directly (not assumed):
   `0 of 44` `ingested/staging/*.json` files had `payload.created_at`
   before a fix, checked with a one-off script rather than by inspecting
   the files by hand. Fixed with a new one-off
   `scripts/backfill-payload-created-at.ts`, setting
   `payload.created_at = created_at` (the field extraction has *always*
   populated, just never plumbed into `payload`) for any candidate
   missing it, across every status folder — run for real, backfilling
   208 candidates repo-wide, all 44 of the currently-`ingested/staging`
   ones among them.

Both require a second rollback-and-recommit cycle to actually reach
staging — the code and data fixes above only take effect on the *next*
commit, not retroactively on rows already written under the old
(regressed or under-populated) behavior. Applying
`20260709114200_ingest_test_restore_source_url.sql` (via `supabase db
push`, which will now pick it up as a genuinely new, unapplied version)
is a prerequisite for that recommit — without it, staging is still
running the version with `source_url` missing.

---

## ⬜ 37 — Run the import: staging, then production

**The gap this closes:** everything above is infrastructure; this step is
the actual, one-time deliverable the user asked for — Lejonklou playground
thread content actually present in the app.

**Decisions:**

1. **Staging first, always production second** — matching this project's
   established migration convention (`CLAUDE.md`: "Migrations apply
   independently to each project — apply to staging first, then
   production") extended to data operations, not just schema. As of step
   34's `--env` design, this isn't just a documented convention to
   remember to follow — production's commit input (`ingested/staging/`)
   physically doesn't exist until a staging commit has produced it.
2. **Not a single rigid pass — scrape/extract can loop, before the
   staging commit.** Scrape the thread; run extraction; review the
   resulting `needs_review` candidates (resolve or accept each) and
   spot-check `ready` ones; approve what's ready to go. Re-scraping and
   re-running extraction is safe and incremental (step 35 decision 4), so
   this can repeat as needed before anything is committed.
3. Run `commit-lejonklou.ts --env staging` for real against
   `audiophile-staging`. Manually verify a sample of imported tests render
   correctly in the actual app (test detail page, system snapshot history,
   track pages) — not just "the API call succeeded."
4. Once satisfied, run `commit-lejonklou.ts --env production` — **not** a
   fresh scrape/extract/approve cycle. This commits exactly the
   candidate set that just passed staging verification (step 36 decision
   1's folder chain makes this the only thing this command can do — it
   reads `ingested/staging/`, which is precisely that set). If more forum
   content has appeared since the staging run and you want it included
   too, that's a new, separate full pipeline run — scrape → extract →
   review/approve → commit to staging → verify → commit to production —
   not something folded into finishing this one.

**Not part of this step:** the user-merge/claim flow (letting a real
Lejonklou member claim their imported content once they join) is
explicitly deferred — see below. Import rollback (step 38) is a documented
safety net that sits alongside this step, not a dependency of it.

**Tests:** none new — this step *exercises* steps 30–36, it doesn't add
code. Verification is the manual review described above.

---

## ⬜ 38 — Import rollback

**The gap this closes:** no documented, reviewed mechanism exists for
undoing a bad production import. This needs to be written and reviewed
*ahead of time* — composing a destructive query live, during an incident,
against production, is exactly the kind of pressure that produces
mistakes.

**A first, narrower version was built ahead of this step's formal turn —
`scripts/rollback-lejonklou.ts` / `lib/ingestion/rollback.ts` — to unblock
finding 8 above's delete-and-recommit cycle on staging. Still ⬜, not ✅:
it deliberately does not yet satisfy this plan's decision 3 safety
conditions, so it is not yet safe to point at production once step 39
(claim flow) exists.** What was actually built, and how it differs from
the plan below:
- **Scoped by local candidate file, not by a server-side `source_ref
  like` query (decision 2).** `rollbackEnvironment` reads whichever
  candidates currently sit in `ingested/staging/`(`--env staging`) or
  `ingested/production/` (`--env production`) and deletes exactly the
  tests matching those candidates' `source_ref`s — correct and
  sufficient for "undo the batch this local repo just committed," which
  is the actual immediate need, but it depends on the local
  `scripts/output/candidates/` state matching the server, unlike the
  plan's self-contained DB-side pattern match.
- **No placeholder-ownership check (decision 3, first bullet) — the real
  gap.** Nothing yet confirms a test's owner is still a placeholder
  before deleting it. Harmless today (step 39/claim flow doesn't exist,
  so nothing has ever been claimed), but this must be added before this
  script is ever run with `--env production` after claiming exists, or a
  rollback could delete a real claimed user's content.
- **No track-still-referenced check (decision 3, second bullet) — by
  design, not by omission.** Deliberately never deletes
  `system_snapshots`/`systems`/`tracks` at all (they're safely shared/
  reusable — a recommit resolves them again rather than duplicating), so
  the cross-reference risk decision 3 describes doesn't arise for this
  narrower scope.
- **`--dry-run` implements decision 6** (lists matching candidates/test
  ids without deleting or moving anything).
- Decisions 4 (placeholders/`import_authors` left alone), 5 (naturally
  time-boxed once decision 3's check above is added), and 7 (Supabase
  backup/PITR — separate verification, not done here) are all still
  exactly as planned, not yet acted on.

**Verified:** `npm run test` includes 6 new
`lib/ingestion/__tests__/rollback.test.ts` tests (empty-folder no-op, the
full votes→clip_mapping→clips→tests deletion order with the candidate
file moved back to `approved/`, the `production` env moving back to
`ingested_staging` instead, `--dry-run` doing no deletes/moves, a
mid-batch delete failure leaving the candidate file unmoved, and a
"resolved zero tests" case still moving the local file back). CLI argv
validation (no args, valid `--env` with no credentials set) manually
exercised. Not yet run for real against staging's actual 44 committed
tests — that's the immediate next step once finding 8's `ingest_test` fix
above is deployed.

**Decisions:**

1. **A targeted, `source_ref`-scoped delete is the primary mechanism for
   this — not a Supabase backup/point-in-time-recovery restore.** A
   whole-database restore is all-or-nothing: it would also destroy any
   real, unrelated user activity (new signups, votes on unrelated tests)
   that happened after the restore point, not just the imported rows.
   Given `audiophile-prod` is a live app, that collateral damage is a real
   cost, not a minor caveat. A `source_ref`-scoped delete only touches
   imported rows.

2. **The query is written and reviewed now, committed as an artifact —
   not composed ad hoc during an incident.** Reuses the exact FK-safe
   deletion order `testing.md` §5 already documents for E2E teardown:
   `votes → clip_mapping → clips → tests → system_snapshots → systems →
   tracks`, scoped by `tests.source_ref like 'lejonklou-forum:%'` and the
   systems/snapshots reachable from those tests.

3. **Safety conditions are baked into the query itself, not left to
   memory:**
   - **Never touch a system or test whose owner is no longer a
     placeholder.** Once the future claim step (merge/claim flow, above)
     exists, some imported content may already have been reassigned to a
     real user and its placeholder deleted. The query joins through
     `systems.owner_id`/`tests.creator_id` → `users.is_placeholder` and
     only acts on rows still placeholder-owned — so it's automatically a
     partial no-op for anything already claimed, rather than relying on
     "remember not to run this once claiming starts."
   - **Never delete a track still referenced by a surviving test.**
     Tracks aren't exclusively owned — matched globally by (artist,
     title) — so a track a placeholder's import created could coincidentally
     also be referenced by an unrelated real test created independently
     (before or after the import). The query must confirm no test outside
     its own delete set still references a track before deleting it, not
     just check who originally created it.

4. **Placeholder accounts and `import_authors` mappings are left in
   place, not deleted.** They're harmless on their own (no exposed
   content once their data is gone), and `create-placeholder-author.ts`'s
   existing `(source, external_username)` idempotency means a later
   re-import cleanly reuses them rather than creating duplicates —
   deleting and recreating them would just be wasted churn.

5. **Time-boxed by construction, not by policy alone.** Because of
   decision 3's ownership check, the query becomes progressively less
   applicable as real claims happen — there's no separate "expiry"
   mechanism to build; it falls out of the safety condition for free.

6. **Dry-run first, matching this whole pipeline's philosophy.** Run the
   same scoping conditions as a `select`/count first, review the result,
   before ever running the real `delete` — the same "preview before a
   destructive action" discipline steps 34's validation and 36's staging
   rehearsal already apply elsewhere in this plan.

7. **Supabase backup/PITR availability is a separate, general
   verification — not new work this step produces.** Confirm whether
   `audiophile-prod`/`audiophile-staging` are on a plan tier that includes
   point-in-time recovery or daily backups, and note the retention window
   if so. Worth knowing as ordinary production hygiene regardless of this
   import, but not relied on as the primary undo path here, given decision
   1's collateral-damage concern.

**Files to update:**
- A new, committed, reviewed artifact holding the query — exact location
  TBD at build time (e.g. `docs/import-rollback.md` or a `scripts/`-
  adjacent SQL file), not something composed ad hoc against production.
- `testing.md` §5 — cross-reference noting its FK-safe deletion order is
  reused here, beyond just E2E teardown.
- This step, plus a cross-reference from step 37 (added above).

**Tests:** none — this is a documented, reviewed query, not application
code. "Testing" here means dry-running it against staging's real,
disposable post-step-37 data to confirm it identifies exactly the imported
rows and nothing else, before it's ever needed for real.

---

## ⬜ 39 — Claim flow (merge a placeholder into a real account)

**The gap this closes:** step 32's provenance UI makes placeholder-owned
content discoverable and, via its addendum below, contactable — but
nothing exists to actually perform a claim once a real forum member gets
in touch. Step 30 anticipated the *mechanics* of a merge ("reassign FK
columns... then delete the placeholder identity") but not how identity
gets verified or who triggers it — this step resolves both.

**Decisions:**

1. **Verification: the claimant PMs the site owner's own Lejonklou forum
   account — no generated code needed.** The forum's own PM system already
   attributes a message to its sender's account; that attribution *is* the
   proof of control, the same logic as any "message me from the account
   you're claiming" check. The claimant states their real
   audiophile-compare email in the PM; the site owner (who already has a
   forum account — that's how the imported content was originally posted)
   manually confirms the sender matches the forum username being claimed.
   No code-generation step, no new UI, no automation — proportionate to
   the actual estimated volume (the owner's own ~10–20 tests, plus 3–10
   other users). Worth adding a generated one-time code only if volume
   ever grows enough to make manual confirmation a real burden — not
   needed now.

2. **The owner's own claim needs no verification step at all.** No
   ambiguity and no adversarial risk when the person performing the claim
   and the person who controls both accounts are the same.

3. **Admin-triggered, not self-service, with no new claim-request state
   machine.** Reuses the existing `isAdminEmail`/`ADMIN_EMAILS` pattern
   already gating `app/version/page.tsx` — a new admin-only page where the
   signed-in admin enters the placeholder's forum username (or its
   `import_authors` row) and the real user to merge into, after manually
   confirming the PM. No `pending`/`approved` claim-request table in the
   DB — the volume doesn't justify it, and the "state" is just the PM
   conversation itself. A claimant who hasn't registered yet just registers
   normally first; the merge target is an ordinary, already-existing
   `public.users` row, nothing claim-specific about it.

4. **The merge is a `security definer` Postgres function,
   `claim_placeholder(placeholder_user_id uuid, real_user_id uuid)`,
   called via the admin/service-role client — mirroring `ingest_test`'s
   design (step 31), not hand-rolled ordered updates from a route.** One
   transaction: reassign `systems.owner_id`, `tests.creator_id`,
   `tracks.created_by`, `votes.user_id` from the placeholder to the real
   user; **repoint, not delete,** the `import_authors` row (per step 30's
   original design — "this account is forum's `BassHead99`" stays a
   permanent, now-accurate fact); then delete the placeholder's
   `auth.users` row via `admin.auth.admin.deleteUser()` (mirroring the
   Admin SDK precedent `create-placeholder-author.ts` established for
   creation). **To verify at build time, not assume:** whether
   `public.users` needs an explicit companion delete or already cascades
   from the `auth.users` delete — step 30 only added insert/update
   triggers (`handle_new_user`, `handle_user_email_updated`), no delete
   trigger, so this needs checking.

5. **Vote-collision handling: the real user's own vote wins.** `votes` has
   `UNIQUE (test_id, user_id, technique_id)` — if the real user already
   voted on a test with their own account before claiming a placeholder
   that also voted on that same test/technique, reassigning the
   placeholder's vote would collide. The function skips (drops) the
   placeholder's vote in that case rather than erroring the whole merge or
   overwriting the real user's own vote — `ON CONFLICT ... DO NOTHING`
   semantics, the same style already used in `ingest_test` (step 31,
   decision 9's correction).

6. **Security-critical — same EXECUTE lockdown as `ingest_test`, arguably
   more so.** `claim_placeholder` bypasses RLS by necessity (reassigning
   content between two arbitrary users is not something any normal
   session should ever be able to do). Its migration must explicitly
   revoke EXECUTE from `anon`/`authenticated`/`public` and grant only
   `service_role`, verified directly against staging with the anon key,
   the same discipline step 31 already applied. A leaked EXECUTE grant
   here would let anyone reassign anyone else's content, not just insert
   new rows — higher blast radius than `ingest_test`.

7. **The admin route is gated by session + `isAdminEmail`, then uses the
   admin client — not `INGEST_SECRET`.** Unlike the ingest route (a
   server-to-server call with no user session), this is a human,
   browser-driven action from the site owner's own logged-in session.
   `app/api/admin/claim/route.ts` checks `isAdminEmail(user.email)` first
   (mirroring `/version`'s gate), then calls `createAdminClient()` to
   invoke `claim_placeholder` — "authenticated app-layer check, then
   service-role client underneath" is the same shape the cron route
   already uses, just with a session check instead of a cron secret.

8. **Step 32's provenance UI gets a small addendum, not a redesign: a
   contact link next to the existing badge/link.** Something like "Think
   this is yours? [contact email]" alongside the "View original post"
   link, so a real forum member who recognizes their own content actually
   has a way to start a claim — otherwise step 32 shows provenance with no
   next step for the person it's about. Additive to already-written (not
   yet built) step 32; doesn't reopen its core design.

**Files to update:**
- New migration — `claim_placeholder(placeholder_user_id uuid, real_user_id
  uuid) returns void`, plus `revoke`/`grant` matching `ingest_test`'s
  pattern.
- `app/api/admin/claim/route.ts` (new).
- `app/admin/claim/page.tsx` (new) — a minimal form (placeholder
  identifier, real user identifier), gated by `isAdminEmail`.
- `build-history.md` step 32 — addendum noting the contact link (see
  decision 8).
- `api-conventions.md`, `audiophile-compare-schema.md`, `components.md`,
  `testing.md`, `core.md` — per the usual pattern, once built.

**Tests:**
- **Unit/integration** (mirroring step 31's `route.integration.test.ts`
  pattern): `claim_placeholder` correctly reassigns all four FK columns;
  repoints (not deletes) `import_authors`; deletes the placeholder's
  auth/public rows; correctly skips a colliding vote rather than erroring
  the whole merge. EXECUTE lockdown confirmed directly against staging
  with the anon key, same as step 31.
- **E2E:** none — an admin-only backend operation behind a minimal form,
  not a public flow needing browser-driven coverage at this stage.
