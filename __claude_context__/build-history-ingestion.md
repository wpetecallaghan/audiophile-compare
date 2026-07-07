---
name: audiophile-compare-build-history-ingestion
description: >
  Detailed step-by-step build plan for the Lejonklou forum ingestion
  pipeline (build-history.md steps 30+). Companion to build-history.md
  (which holds only short pointer entries for these steps, to keep the
  main index scannable) and deferred-features.md (original architecture
  notes and rationale — the "why", not the "how"). Load this when working
  on any forum-ingestion build step.
---

# Forum Ingestion Pipeline — Detailed Build Plan

Full detail for `build-history.md` steps 30–33. See `deferred-features.md`'s
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

## ⬜ 31 — Internal ingest API route (`POST /api/internal/ingest`)

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
   `forum_username` within the payload — `create-placeholder-author.ts`'s
   existing `(source, external_username)` lookup already makes calling it
   twice for the same voter within one request harmless, just redundant).

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

7. **Clip verification is *not* this route's job.** The route trusts the
   caller (the scraper/extraction script, step 32) to have already
   confirmed both clip URLs are reachable — same "client already verified,
   server persists" pattern `POST /api/tests` already uses for
   browser-submitted clips. Re-verifying server-side here would just
   duplicate step 32's clip-health filter for no benefit.

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
- **Unit:** none planned — API routes aren't unit-tested in this project
  (consistent with every other route).
- **E2E / integration:** a script-driven test (not Playwright — no
  browser involved) that POSTs a synthetic payload twice and confirms (a)
  the first call creates exactly one test/track/system/snapshot set and
  resolves/creates the placeholder post-author *and* voter placeholders,
  (b) the second call with the same `source_ref` is a no-op, (c) a payload
  naming an existing system under the *same* author matches it rather than
  duplicating, (d) two different authors using the same system name each
  get their own system, and (e) two votes citing the same technique from
  two different `voter`s both succeed (the case decision 3 fixes), while
  two votes citing the same technique from the *same* voter still hit the
  `UNIQUE (test_id, user_id, technique_id)` constraint as intended.
  **Data hygiene:** runs against staging, following the exact convention
  `testing.md` §5 already mandates for Playwright E2E — every synthetic
  `track`/`system`/`test` title this script creates is prefixed `[E2E]`,
  so the existing `global-teardown.ts` sweep picks them up with no new
  mechanism needed. No separate disposable database is introduced.

---

## ⬜ 32 — Scraper + extraction script

**The gap this closes:** phases 1–3 of the pipeline (fetch, extract,
clip-health filter) don't exist — this is genuinely new capability, not
a variation on an existing pattern, and is the highest-risk step in this
plan.

**Decisions:**

1. **A standalone script, not a deployed route.** `scripts/ingest-lejonklou.ts`
   (or similar), run manually/locally against a thread URL. The original
   doc's aspiration of "periodic scheduled refreshes" is explicitly **not**
   in scope for this pass — running it by hand against a specific thread
   is enough for the stated goal (import what's retrievable from one
   playground thread), and scheduling can be layered on later without
   changing anything else in this plan.

2. **Fetch phase is deterministic HTML parsing**, not an LLM task — walk
   the thread's pagination, extract each post's author, timestamp, and raw
   body. No new architectural decision here; standard scraping.

3. **Extraction must run per-author-across-their-whole-post-history, not
   per-post independently.** This is the hardest open problem in the whole
   plan: a single forum author's system evolves across many posts (v1 →
   v2 → v3), and the point of the snapshot-history feature is capturing
   that continuity — not minting a new one-off `System` per post. A
   fully independent per-post extraction call has no way to know "this is
   snapshot v2 of the system I saw four posts ago." Recommend grouping all
   of one author's posts together and giving the extraction pass running
   state across them (e.g. "here are this author's prior posts and the
   systems/snapshots already derived from them — does this new post
   describe one of those, a new version, or a new system entirely?").
   **This sub-problem likely deserves its own short design/prototyping
   pass before full implementation** — flagging rather than fully
   resolving it here.

4. **"Unbroken" is enforced here, not in the ingest route** — for every
   candidate pair of clip URLs a post appears to describe, run the
   *existing* `detectProvider`/`checkDirectUrl` logic (`lib/clips/
   detect-provider.ts`, `lib/clips/check-url.ts` — the same code
   `POST /api/clips/verify` already uses) and drop the candidate if either
   URL is dead. Zero new clip-validation logic.

5. **Dry-run mode is required, not optional.** Given the extraction step's
   inherent uncertainty (forum prose is messy; most posts won't cleanly
   fit the blind-A/B-test pattern at all), the script must support printing
   every candidate `IngestPayload` it would send for human review *before*
   actually POSTing anything — this is how the staging run (step 33) does
   its review pass.

**Files to update:**
- `scripts/ingest-lejonklou.ts` (new) and any supporting modules under
  `scripts/lib/` (fetch/parse, extraction prompt, clip-health filter).
- No app code changes beyond what step 31 already added.

**Tests:**
- **Unit:** the deterministic parts only — HTML-parsing/pagination logic,
  and the clip-health filter (already covered by existing
  `detect-provider`/`check-url` unit tests; just confirm this script calls
  them correctly). The LLM extraction step itself isn't unit-testable in
  the traditional sense — validated instead by the dry-run review in
  step 33.

---

## ⬜ 33 — Run the import: staging, then production

**The gap this closes:** everything above is infrastructure; this step is
the actual, one-time deliverable the user asked for — Lejonklou playground
thread content actually present in the app.

**Decisions:**

1. **Staging first, always production second** — matching this project's
   established migration convention (`CLAUDE.md`: "Migrations apply
   independently to each project — apply to staging first, then
   production") extended to data operations, not just schema.
2. Run in dry-run mode first, manually review a sample of extracted
   payloads (spot-check track/system/snapshot matching, before/after
   correctness, clip health) before allowing any real POSTs.
3. Run for real against `audiophile-staging`. Manually verify a sample of
   imported tests render correctly in the actual app (test detail page,
   system snapshot history, track pages) — not just "the API call
   succeeded."
4. Once satisfied, re-run against `audiophile-prod`.

**Not part of this step:** the user-merge/claim flow (letting a real
Lejonklou member claim their imported content once they join) is
explicitly deferred — see below.

**Tests:** none new — this step *exercises* steps 30–32, it doesn't add
code. Verification is the manual review described above.

---

## Explicitly deferred: merge/claim flow

Not planned in detail here — the user has indicated this will be requested
as its own future build step. Noted for forward-compatibility only: because
every placeholder is a full, real `auth.users`/`public.users` row (step 30,
decision 1), the eventual merge is expected to be mechanically simple —
reassign the FK columns that reference the placeholder's `user_id`
(`systems.owner_id`, `tests.creator_id`, `tracks.created_by`, `votes.user_id`
if any placeholder ever voted) to the real user's id, then delete the
placeholder identity. This is the same two-step "reassign, then delete"
shape as the manual account cleanup already performed once in this project
outside of any build step (removing a stale test-registration account from
`audiophile-prod` — see chat history, not a build-history entry since it
wasn't a code change).
