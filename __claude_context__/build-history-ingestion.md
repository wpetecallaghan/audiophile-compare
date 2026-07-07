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

## ⬜ 35 — Extraction

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

2. **`source_ref` gets a pair index.** A single post can describe more
   than one clip pair — "if there is more than one pair, each pair is a
   before/after of the same change, but with different tracks" — so one
   post can yield multiple independent candidates, each its own test. Key
   candidates as `<thread>:post-<n>:pair-<i>` (`pair-1` even when there's
   only one, for consistency). Every candidate also carries a `source_url`
   — step 32's (in `build-history.md`) column and payload field — set to
   the initiating post's `post_url` (step 33's scraper output); all pairs
   from the same post share that post's URL.

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
   ```
   A candidate's status is simply which folder its file is sitting in —
   "approving" a `ready` (or fixed `needs_review`) candidate means moving
   its file into `approved/`; nothing to keep in sync, no risk of a status
   field drifting from where the file actually lives. `pending` is
   materialized as soon as the initiating clip-pair post is found, even
   before any votes or reveal exist, so the repository shows what's still
   "in flight." The two `ingested/` stages form a strict chain — see step
   34 decision 1 for why `ingested/staging/` is also production's *input*
   folder, not just a record.

4. **Extraction is incremental and safe to re-run.** Re-running against an
   updated scrape (e.g. after a re-scrape picks up new posts) creates or
   updates a candidate's file in `pending/`, `needs_review/`, or `ready/`
   as more of the thread resolves, but **never touches a candidate whose
   file already exists in `approved/`, `ingested/staging/`, or
   `ingested/production/`** — checked by looking for that `source_ref`'s
   filename in those three folders first. A human decision, once made,
   isn't silently clobbered by a later run — and a candidate already in
   flight through the ingest chain can't be reset back to `pending` by a
   fresh scrape either.

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

6. **A test that never gets revealed stays `pending` forever and is never
   promoted.** `before_is_a` is mandatory for `ingest_test` and has no
   other source — rather than guess, or add an update-after-ingest
   mechanism (which the app has no other use for and shouldn't grow just
   for this), an unrevealed test is explicitly out of scope for this
   import. Votes and snapshot data for it are simply never committed.

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

10. **Reply-to-test attribution is the hardest remaining open problem —
    still not fully resolved, needs its own design/prototyping pass —
    though real sampling found it's less uniformly hard than first
    thought.** Primary signal is step 33's `quoted_post_url`. Sampling the
    thread's *start* initially found phpBB's default quote rendering never
    links back to the quoted post; sampling its *end* corrected that —
    the forum's software was evidently upgraded at some point to a
    version that does include a resolvable link, and **35% of posts in a
    978-post sample from the thread's recent history had one.** So
    `quoted_post_url` is a strong signal for a real, sizeable fraction of
    (especially more recent) replies — but a fallback heuristic is still
    needed for the rest — e.g. matching a reply's mentioned clip
    labels/links against the set of currently-`pending`/open candidates
    from the same or a plausibly-related creator. **Concrete real example
    the fallback needs to handle:** a reply saying "I prefer the first one
    (1153)" with no link and no quote at all — "1153" is a bare-number
    forum label (decision 5) that only resolves to a specific candidate by
    matching against labels already seen in that creator's pending posts,
    not via any link or quote signal. This is exactly the kind of
    ambiguity decision 7's `needs_review` mechanism exists for: an
    extraction that isn't confident which test a vote belongs to should
    flag it rather than guess silently.

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

12. **"Unbroken" is enforced here, not in the ingest route** — for
    whichever links a candidate resolves as its actual clip pair, run the
    *existing* `detectProvider`/`checkDirectUrl` logic (`lib/clips/
    detect-provider.ts`, `lib/clips/check-url.ts` — the same code
    `POST /api/clips/verify` already uses) and drop the candidate (or mark
    it `needs_review`) if either URL is dead. Zero new clip-validation
    logic. **Caveat, partially resolved by `build-history.md` step 34:**
    Drive links now get real embedded playback via the new `google-drive`
    provider (no health check, same as youtube/vimeo — an unreachable
    embed just shows its own broken state). Google Photos and iCloud
    links (~69 of the ~150 found across both samples) remain in
    `detectProvider`'s `unknown` bucket by design — no stable embeddable
    URL exists for either — where a HEAD check only confirms the *share
    page* loads, not that the underlying media still plays. "Unbroken" is
    meaningfully enforced for youtube/vimeo/direct/google-drive links, not
    for Photos/iCloud links, which is an accepted limitation, not an open
    question anymore.

13. **Validation happens continuously, not as a separate "dry-run mode."**
    Because extraction only ever writes local candidate files and never
    calls the ingest route itself, there's no live/dry-run mode
    distinction to design — every run is inherently side-effect-free
    against the app. Each candidate is validated against the same
    constraints `ingest_test` would enforce (`chosen_label` is `'A'`/`'B'`,
    clip URLs pass the health filter, required fields present) before
    being marked `ready`; a failure keeps it at `needs_review` with the
    specific problem recorded in `issues`, rather than emitting a payload
    that would only fail later, at commit time.

14. **Extraction technology: Vercel AI SDK (`ai` package), `generateObject`
    with a Zod schema, via the AI Gateway using a plain
    `"anthropic/claude-..."` model string** (no separate `@ai-sdk/anthropic`
    package). Chosen over calling the Anthropic API directly or using the
    Claude Agent SDK: it fits this project's Vercel-native conventions,
    and schema-validated structured output directly satisfies decision 13
    — a malformed extraction is a catchable Zod error, not something to
    hand-roll validation for. One `generateObject` call per post (or small
    batch), with a rolling summary of the author's previously-derived
    system/snapshot state passed as context for decision 8's continuity
    tracking — deliberately simpler than giving the model its own
    tool-using agent session, which isn't needed for what's fundamentally
    single-shot structured extraction repeated with accumulated context.
    Needs a new `ai` (and `zod`, not currently a dependency) package, and
    an AI Gateway credential — exact env var/provisioning mechanism to be
    resolved at build time.

**Files to update:**
- `lib/ingestion/extract/candidate.ts` (new) — candidate JSON shape; the
  `pending`/`needs_review`/`ready`/`approved`/`ingested` folder layout;
  read/move helpers that respect decision 4 (never touch a `source_ref`
  that already has a file in `approved`/`ingested`).
- `lib/ingestion/extract/extract-post.ts` (new) — the `generateObject`
  call plus the deterministic wrapping around it (clip-health filtering,
  technique hardcoding, track-identification fallback, per-author running
  state).
- `scripts/extract-lejonklou.ts` (new) — CLI entrypoint: reads step 33's
  JSON, groups by author, walks posts building/updating candidates.
- `package.json` — new `ai`/`zod` dependencies; new `extract:lejonklou`
  script.
- `.gitignore` — ignore the candidates output location (human-edited
  working state, not committed source).
- `docs/vercel-setup.md` / `api-conventions.md` — once the AI Gateway
  credential mechanism is resolved.
- `core.md` / `testing.md` — per the usual pattern, once built.

**Tests:**
- **Unit:** candidate status-transition logic (new candidate → `pending`;
  becomes `ready`/`needs_review` once complete; re-running never
  regresses an `approved`/`ingested` candidate); track-identification
  fallback (produces a unique placeholder per `source_ref`, never a shared
  one); the clip-health filter (thin wrapper over already-tested
  `detect-provider`/`check-url` — just confirm correct usage); Zod schema
  validation itself. The `generateObject` call is mocked in these tests —
  the model call itself isn't unit-testable in the traditional sense.
- **E2E / integration:** none — no deployed route is touched.

---

## ⬜ 36 — Commit

**The gap this closes:** approved candidates need to actually reach the
app. This is the only step in the whole pipeline that makes a real HTTP
call to a deployed environment — deliberately separated from extraction
(step 35) since it has none of extraction's uncertainty: no LLM, no
judgment calls, nothing to review.

**Decisions:**

1. **A single script, parameterized by target environment, reading a
   different source folder per environment — enforcing "staging first" at
   the tooling level, not just as a documented convention.** `scripts/
   commit-lejonklou.ts <base-url> --env staging|production`:
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
2. **A non-2xx response leaves the file in its current source folder**
   (`approved/` for a staging attempt, `ingested/staging/` for a
   production attempt), with the error recorded (e.g. appended to the
   candidate's `issues`), so it's retried on the next run rather than
   silently lost.
3. **Idempotent by construction, independent of this script's own
   bookkeeping.** Even if `commit-lejonklou.ts` is run twice for the same
   candidate and environment, `ingest_test`'s `source_ref` uniqueness
   means a repeat POST just returns `already_imported: true` rather than
   duplicating — moving the file is a convenience, not the safety
   mechanism.
4. **No new library code beyond the CLI script itself** — it's a thin
   loop (list the environment's source folder → POST each → move to that
   environment's destination folder on success), fully testable with a
   mocked `fetch` and a temp fixture directory.
5. **Target base URL and `--env` are both required CLI arguments, no
   defaults.** `tsx scripts/commit-lejonklou.ts <base-url> --env staging`.
   Defaulting either would risk an accidental run against the wrong
   environment or the wrong source folder. `INGEST_SECRET` stays an env
   var, not a CLI arg — a secret shouldn't appear in shell history or `ps`
   output.
6. **No new dependencies — reuses exactly what steps 33/33 already
   established.** `tsx` as the runtime (already added in step 33); the
   built-in global `fetch` for the POST (no HTTP client library); Node's
   built-in `fs/promises` for listing a folder and `rename()`-ing a file
   into its destination on success (a same-filesystem rename is atomic —
   no separate copy-then-delete needed); `process.loadEnvFile()` to read
   `.env.local` for `INGEST_SECRET`, the same pattern already used by
   `playwright.config.ts` and `vitest.integration.config.ts`.

**Files to update:**
- `scripts/commit-lejonklou.ts` (new).
- `package.json` — new `commit:lejonklou` script.
- `core.md` / `testing.md` — per the usual pattern, once built.

**Tests:**
- **Unit:** given a fixture directory tree with files spread across
  `approved/`, `ingested/staging/`, and other folders: `--env staging`
  only POSTs files from `approved/` and moves successes to
  `ingested/staging/`, ignoring anything already in `ingested/staging/`;
  `--env production` only POSTs files from `ingested/staging/` (confirms
  it never touches `approved/`, even when `approved/` still has entries)
  and moves successes to `ingested/production/`; a non-2xx response
  leaves the file in its source folder with the error recorded rather
  than silently dropping it. `fetch` is mocked — no real network call, no
  live Supabase/Vercel dependency in this test — and the fixture
  directory is a temp folder, not the real `scripts/output/` path.
- **E2E / integration:** none beyond what step 31 already has for the
  ingest route itself.

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
