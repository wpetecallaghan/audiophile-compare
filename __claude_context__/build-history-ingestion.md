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

## ⬜ 30 — Placeholder author infrastructure

**The gap this closes:** nothing today can represent "a Lejonklou forum user
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

**Files to update:**
- New migration: `alter table public.users add column is_placeholder boolean not null default false;`
- `lib/ingestion/create-placeholder-author.ts` (new) — the resolve-or-create
  helper: given a forum username, look up an existing placeholder by a
  `forum_username` we'll need to store somewhere to resolve on repeat runs
  (see open question below), else slugify → check collision → insert
  `auth.users` (admin client) → `update public.users set is_placeholder = true`.
- `docs/` — no new user-facing doc needed (this is internal infrastructure,
  not a user-visible feature); note the new column and its purpose in
  `audiophile-compare-schema.md` at build time.

**Open question to resolve before/during build:** where does the
`forum_username → placeholder user_id` mapping live so re-running the
importer resolves the *same* placeholder instead of creating duplicates?
Options: (a) a new small `public.import_authors` table (`forum_username`
unique, `user_id` references `public.users`), or (b) store the forum
username in `public.users` itself (e.g. reuse `email`'s local-part via a
deterministic slug, and look up by the exact placeholder email you'd
construct for that username — no new table, but a bit implicit). Leaning
towards (a) — an explicit small table is clearer and gives the ingest
route (step 31) a fast, unambiguous lookup — but worth a final call at
build time rather than in this planning pass.

**Tests:**
- **Unit:** `create-placeholder-author.ts` — slugification (lowercase,
  strip, truncate, collision suffix), and that it returns an existing
  placeholder's id on a second call for the same username rather than
  creating a duplicate.
- **E2E:** none — this is backend infrastructure with no page to drive.

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

2. **Extend the documented `IngestPayload` with an `author` field:**
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
       chosen_label: 'A' | 'B'
       technique_name: string
       observation?: string
       other_description?: string
     }>
   }
   ```
   Everything else matches the existing documented shape.

3. **System/track matching, scoped correctly for multiple authors.**
   Tracks match globally by artist+title (tracks were never per-owner in
   the schema — no change from the original plan). Systems match by name
   **scoped to the resolved author** — two different forum members can
   both plausibly name a system "Living room rig"; matching must go
   through `systems where owner_id = :placeholder_id and name = :system_name`,
   not a bare name lookup. The original single-bot design didn't need this
   distinction since everything belonged to one owner.

4. **Atomicity.** A single test's worth of writes (track/system/snapshot
   resolution, test, clips, clip_mapping, votes) should either fully
   succeed or fully roll back — a partial import across six tables would
   be tedious to find and clean up by hand. Recommend a Postgres function
   (`create or replace function ingest_test(...) returns uuid`) called via
   `.rpc()`, giving transactional atomicity for free, over hand-rolled
   ordered inserts with manual cleanup-on-failure in the route handler.
   Adds one migration; worth it for the safety.

5. **Idempotency unchanged from the original plan** — check `source_ref`
   on `tests` first; return 200 with an "already imported" indicator
   rather than erroring, so re-running the importer over the same thread
   is always safe.

6. **Clip verification is *not* this route's job.** The route trusts the
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

**Tests:**
- **Unit:** none planned — API routes aren't unit-tested in this project
  (consistent with every other route).
- **E2E / integration:** a script-driven test (not Playwright — no
  browser involved) that POSTs a synthetic payload twice and confirms (a)
  the first call creates exactly one test/track/system/snapshot set and
  resolves/creates the placeholder author, (b) the second call with the
  same `source_ref` is a no-op, (c) a payload naming an existing system
  under the *same* author matches it rather than duplicating, and (d) two
  different authors using the same system name each get their own system.

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
