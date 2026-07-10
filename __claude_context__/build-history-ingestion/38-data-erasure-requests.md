---
name: audiophile-compare-build-history-ingestion-38
description: Forum ingestion step 38 — Data erasure requests (votes / content / full account).
---

# ✅ 38 — Data erasure requests (votes / content / full account)

**This step's scope has changed from its original plan — read this first.**
The original plan below this notice (kept for its still-relevant
schema/atomicity reasoning) was "undo a bad production import," a
developer-facing safety net. The real, concrete need turned out to be
different: **support requests from real people asking for their data to
be removed**, a user-rights concern (effectively "right to erasure"),
not an ingestion-pipeline bug-recovery tool. This replaces step 38's
scope entirely.

**`scripts/rollback-lejonklou.ts` / `lib/ingestion/rollback.ts` (built
during step 36 findings 8–9) is *not* this step, was never renamed to
match it, and is left exactly as-is.** It's an interim, ingestion-
pipeline-only tool — undoing this local repo's own most recent
commit-to-an-environment, scoped to whatever candidate files currently
sit in `ingested/staging/`/`ingested/production/`, for the
extraction/recommit iteration loop only (see step 36 findings 8–9 for why
it was needed). It does not attempt, and was never intended, to satisfy
a general "remove this person's data" request — it has no concept of
"this specific user," only "whatever this local repo just committed."
`docs/vercel-setup.md` and `api-conventions.md` previously described it
as "step 38, a first version" — both corrected alongside this rewrite to
stop implying a connection that no longer holds.

**The gap this closes:** three real support scenarios, distinct from
anything the ingestion pipeline itself needs to handle:
1. An ingested (forum-sourced placeholder), unmerged, never-logged-in
   user contacts the site owner asking for their **votes** to be
   removed — as if they had never voted at all.
2. An ingested, unmerged, never-logged-in user contacts the site owner
   asking for their **tests (and the systems those tests used)** to be
   removed — as if that content had never been imported.
3. A **registered** (real, non-placeholder) user asks for their data to
   be deleted — votes, systems, snapshots, and tests, all of it.

All three explicitly override existing rules that assume vote/test
permanence — most concretely, `DELETE /api/tests/[id]`'s existing 409
"This test has votes and can no longer be deleted" (`app/api/tests/[id]/
route.ts:100-105`). **That route is unchanged by this step** — normal
self-service deletion still refuses to touch a voted-on test. This step
adds a separate, admin-only, human-verified path that can, deliberately
more privileged than anything a signed-in user can do to their own data
through the ordinary UI.

**Decisions:**

1. **Two generic, reusable `security definer` Postgres functions, not
   three scenario-specific ones.** The actual deletion mechanics are
   identical regardless of whose content it is — only *who's allowed to
   request it, and how that gets verified* differs between "an unmerged
   placeholder" and "a registered user erasing their own data." Splitting
   by mechanics (what gets deleted) rather than by requester type keeps
   each function small, auditable, and shared:
   - `erase_user_votes(target_user_id uuid) returns jsonb` — deletes
     every row in `votes` where `user_id = target_user_id`, wherever
     cast, across any test. Returns `{votes_deleted: n}`.
   - `erase_user_content(target_user_id uuid) returns jsonb` — deletes
     every test this user created and every system they own, fully:
     `votes` (by *anyone*, on those specific tests — the test is going
     away entirely, not being edited) → `clip_mapping` → `clips` →
     `tests` → `system_snapshots` → `systems`, in that order (the same
     FK-safe order `testing.md` §5 already documents for E2E teardown,
     and that `rollback.ts` already reuses independently). Returns
     `{tests_deleted: n, systems_deleted: n, votes_deleted: n}`.

2. **Deleting a user's own systems alongside their tests is always safe
   — verified as a real schema invariant, not assumed.** Checked both
   real code paths that can create a `tests` row: `ingest_test`
   (`supabase/migrations/20260707150400_ingest_test_function.sql:72-74`)
   always matches/creates `snapshot_a`/`snapshot_b`'s systems scoped to
   `owner_id = v_owner_id` (that same test's creator); the web wizard's
   own route (`app/api/tests/route.ts:64-82`) explicitly rejects a
   `snapshot_a_id`/`snapshot_b_id` that doesn't belong to a system owned
   by the caller before ever creating the test. So *no test in this
   schema can ever reference another user's system* — once a user's own
   tests are gone, deleting their systems (and cascading snapshots)
   can't orphan or affect anyone else's data. This is a cleaner
   guarantee than the original plan's "never delete a track still
   referenced by a surviving test" concern (below), which applied to
   tracks specifically because tracks *are* globally shared — systems
   never are.

3. **Tracks are never deleted, by either function — same reasoning as
   `rollback.ts`'s own decision, now confirmed to still apply.** Tracks
   are matched globally by `(artist, title)`, `created_by` is
   provenance, not ownership (`supabase/migrations/
   20260625094142_initial_schema.sql:30-38` has no RLS/ownership
   constraint tying a track to its creator the way systems/tests have).
   A track one user's import/creation produced could legitimately be
   referenced by a completely unrelated person's test. Neither erasure
   request in scope here (case 2's "tests and systems," case 3's "votes,
   systems, snapshots and tests") lists tracks either — consistent with
   what was actually asked for, not just consistent with precedent.

4. **Case → function mapping.** Resolved (was previously flagged as an
   open assumption — confirmed): case 3 deletes the account entirely,
   not just its data. That turned out to need a **third** function,
   `erase_user_account`, and a real schema fix — see decision 4a below.
   - Case 1 (votes only): `erase_user_votes(placeholder_id)`.
   - Case 2 (tests + systems): `erase_user_content(placeholder_id)`.
   - Case 3 (everything, including the account): `erase_user_votes` →
     `erase_user_content` → `erase_user_account`, then
     `admin.auth.admin.deleteUser(user_id)` from application code (the
     Admin SDK call can't run inside a SQL function — same constraint
     `create-placeholder-author.ts` and step 39's planned
     `claim_placeholder` already work within). Each SQL step is
     independently atomic (decision 6), so a failure partway through
     just means a safe, idempotent retry from wherever it stopped.

4a. **A real schema blocker, found by checking rather than assuming
   "delete the account" is simple: `tracks.created_by uuid not null
   references public.users(id)` has no cascade
   (`supabase/migrations/20260625094142_initial_schema.sql:33`), and
   tracks are deliberately never deleted (decision 3).** If the erased
   user ever created a track — even one a *different*, surviving test
   still uses — deleting their `public.users` row would fail outright
   with a foreign-key violation. Checked whether `created_by` is ever
   read anywhere before deciding how to resolve this: it's write-only,
   set once at creation (`app/api/tracks/route.ts:65`) and never
   displayed or joined anywhere in the app. Safe to null out. Fix: a new
   migration drops the `not null` constraint
   (`alter table public.tracks alter column created_by drop not null`),
   and `erase_user_account(target_user_id uuid) returns jsonb` nulls
   `tracks.created_by` for that user's tracks before deleting their
   `public.users` row — `{tracks_orphaned: n, account_deleted: true}`.
   Same EXECUTE lockdown as the other two (decision 9).

   **A second table with the identical shape, found by checking every
   FK to `public.users(id)` exhaustively rather than stopping at
   tracks:** `comments.user_id uuid not null references
   public.users(id)` (line 101 of the same migration) — also no
   cascade. Unlike tracks, `comments` has zero rows and is never
   referenced anywhere in `app/`/`lib/`/`components/` — RLS policies
   exist (`public read`/`authenticated insert`/`owner delete`) but no
   route or component actually reads or writes it; it's a schema-only
   stub for a feature described in the app spec but never built. Doesn't
   block anything *today*, but the identical failure mode would silently
   reappear the moment that feature ships and someone comments — fixed
   now rather than left as a dormant bug for whoever builds it later.
   Treated differently from tracks, deliberately: a comment is this
   user's own authored content (like a vote), not incidental provenance
   (like a track's `created_by`), so it's *deleted*, not anonymized —
   `erase_user_content` also deletes `comments` on any test it's
   removing (by anyone, same as votes/clip_mapping/clips — the test is
   gone, its comments can't survive it), and `erase_user_account` also
   deletes this user's *own* comments on any surviving test (scoped by
   `user_id`, same as `erase_user_votes` — necessary to clear the last
   possible reference before `public.users` can be deleted).

5. **Placeholder accounts and `import_authors` mappings are never
   deleted by either function — deliberately different from `claim_
   placeholder` (step 39), which *does* delete the placeholder identity.**
   Erasure removes *content*, not identity — the placeholder row itself
   carries no exposed content once its votes/tests/systems are gone, and
   leaving it in place means a later re-scrape of the same forum thread
   still resolves it via the existing `(source, external_username)`
   mapping instead of creating a duplicate (same reasoning `rollback.ts`
   and the original plan both already established). If a placeholder's
   erased content is ever re-ingested, it simply reappears as a fresh
   import against the same still-existing identity — expected, not a bug.

6. **Atomicity via real Postgres functions, not client-side multi-call
   deletes — deliberately learning from a real gap found reviewing
   `rollback.ts`.** That script's `rollbackEnvironment` does 4 separate,
   non-transactional REST calls; a failure partway through leaves a
   batch of tests in a partially-deleted state until a safe-but-manual
   retry completes it. `ingest_test` and the planned `claim_placeholder`
   both avoid this by being single `security definer` functions — this
   step follows the same pattern, especially since it's *more*
   consequential (irreversibly destructive) than either.

7. **Admin-triggered, not self-service — mirrors step 39's precedent
   exactly for cases 1–2, extended for case 3.** Reuses the existing
   `isAdminEmail`/`ADMIN_EMAILS` gate. Verification differs by requester:
   - Cases 1–2 (unmerged placeholder): the same forum-PM-to-the-site-
     owner's-own-account verification step 39 decision 1 already
     designed — no new verification mechanism needed, this is the exact
     population step 39 already built identity-proofing for.
   - Case 3 (registered user): the requester already has a real,
     verified email on their account (`auth.users.email`) — the admin
     confirms the request arrived from that same address before acting.
     No new UI for the *user* to self-serve this; proportionate to
     expected volume, matching step 39's own reasoning for staying
     admin-only rather than building a self-service flow.

   **Resolved (was a flagged assumption):** confirmed before build —
   case 3 deletes the account entirely, not just its data. See decision
   4/4a for the `erase_user_account` function this required and the real
   `tracks.created_by` schema blocker it surfaced.

8. **Preview before destroy, matching this whole project's "preview
   before a destructive action" discipline** (`rollback.ts`'s own
   `--dry-run`, step 34's validation, step 36's staging-before-
   production rehearsal). Before calling either function for real, the
   admin route does a plain read (via the admin client, no function
   needed — it's just a count, not a privileged write) showing exactly
   how many votes/tests/systems match the target user, so the admin
   confirms the blast radius before the irreversible call.

9. **EXECUTE lockdown, same discipline as `ingest_test`/the planned
   `claim_placeholder`.** Both functions bypass RLS by necessity
   (deleting another user's rows is not something any normal session
   should ever do) — explicit `revoke ... from public/anon/authenticated`
   plus `grant execute ... to service_role` in the migration, re-verified
   directly against staging with the anon key after applying, not
   assumed safe by pattern-matching the earlier migrations.

10. **Supabase backup/PITR availability — still an open, unverified
    loose end from the original plan, not resolved by this rewrite.**
    Genuinely destructive functions existing at all raises the stakes of
    confirming whether `audiophile-prod`/`audiophile-staging` have any
    point-in-time-recovery safety net. Worth checking before this step
    is actually built, not blocking the plan itself.

**Files to update (once built):**
- New migration — drops `tracks.created_by`'s `not null` constraint
  (decision 4a); `erase_user_votes`/`erase_user_content`/
  `erase_user_account`, plus `revoke`/`grant` matching `ingest_test`/
  `claim_placeholder`'s pattern for all three.
- `app/api/admin/erase-user-data/route.ts` (new) — `isAdminEmail`-gated;
  accepts a target user id and a scope (`votes` | `content` | `full`,
  `full` = both plus account deletion); does the preview read (decision
  8), then calls the function(s) in order, then `admin.auth.admin.
  deleteUser()` for `full`.
- `app/admin/erase-user-data/page.tsx` (new) — minimal form: user
  identifier, scope selection, preview counts, confirm.
- `docs/audiophile-compare-app-specification.md` / schema docs — the
  three new functions, the now-nullable `tracks.created_by`, and an
  explicit note that `DELETE /api/tests/[id]`'s "can't delete a
  voted-on test" rule has an admin-only, human-verified exception now,
  so a future reader doesn't take that rule as absolute.
- `api-conventions.md` — new admin route, mirroring how step 39's
  `/api/admin/claim` is documented once built.
- `testing.md` §5 — already done ahead of the build (the cross-reference
  noting `rollback.ts` and, once built, these functions both reuse its
  FK-safe order), since it cost nothing to fix while writing this plan
  rather than waiting.
- `core.md`, `testing.md` §4/§7 — per the usual pattern, once built.

**Tests (planned):**
- **Integration** (mirroring `route.integration.test.ts`'s real-staging
  pattern, since this is SQL-backed logic no unit test can meaningfully
  cover): `erase_user_votes` deletes exactly the target user's votes on
  a test, leaving a *different* user's vote on that same test untouched;
  `erase_user_content` deletes a user's test(s) and system(s) fully,
  including votes cast on those tests *by other users* (a real, load-
  bearing case — construct a fixture where a second placeholder or the
  real E2E test user has voted on the erased user's test, and confirm
  that vote is gone too, not just the target's own rows); confirms a
  track referenced by the erased content survives if any other test
  still references it (or simply: confirm tracks are never touched, per
  decision 3); `erase_user_content` also deletes comments on the tests
  it removes, by any author, not just the target's own; `erase_user_
  account` nulls `tracks.created_by` for that user's own tracks
  (confirming the track row itself survives), deletes that user's own
  comments on any surviving test, and deletes the `public.users` row;
  confirms `import_authors`/a placeholder's own `auth.users`/
  `public.users` rows survive `erase_user_votes`/`erase_user_content`
  (decision 5) but not `erase_user_account`; EXECUTE lockdown confirmed
  directly against staging with the anon key, for all three functions.
- **E2E:** none — an admin-only backend operation behind a minimal form,
  same reasoning step 39 gives for skipping E2E on `/admin/claim`.

**Verified — migration applied to staging by the user
(`supabase migration list` confirms `20260709133200` now shows
`remote: "20260709133200"`), then re-verified independently rather than
just taken on report:**
- `npm run test:integration` — **14/14 passing** (9 pre-existing +
  5 new), including `erase_user_votes`/`erase_user_content`/
  `erase_user_account` all behaving exactly as designed against real
  staging data, `import_authors`/a placeholder's own account surviving
  `erase_user_votes`/`erase_user_content`, and all three functions
  rejecting an anon-key caller (EXECUTE lockdown confirmed for real, not
  assumed from the migration's `revoke`/`grant` statements alone).
- `npx tsc --noEmit` and the full unit suite (38 files / 440 tests)
  re-run clean after the migration landed.
- Gate re-verified for real with an actual authenticated session, not
  just anonymous requests: reused the saved E2E storageState cookie
  (`playwright/.auth/user.json`, a real but non-admin account) against a
  local dev server — both the page and the route correctly return `404`
  (`{"error":"Not found"}` from the route) for an authenticated
  non-admin, the same as the unauthenticated case's `401`/redirect
  already confirmed. Four of the gate's states now confirmed for real:
  unauthenticated page, unauthenticated route, authenticated-non-admin
  page, authenticated-non-admin route.
- **The actual authenticated-admin happy path — now verified too, by the
  user directly** (the one gap the assistant explicitly couldn't close
  itself, lacking real admin credentials in this environment): confirmed
  the form at `/admin/erase-user-data` presents correctly when signed in
  with the real admin account. All five gate states now confirmed for
  real: unauthenticated page, unauthenticated route,
  authenticated-non-admin page, authenticated-non-admin route,
  authenticated-admin page.
- **Staging only — production has not had this migration applied.**
  Consistent with this project's "staging first" convention; a separate,
  deliberate step whenever this is actually needed for a real request,
  not assumed to follow automatically from staging verification.

---

<details>
<summary>Original plan (superseded by the above — kept for its still-relevant reasoning, not as current guidance)</summary>

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

**Why this was superseded:** decision 3's ownership check only ever
covers a test/system's own `creator_id`/`owner_id` — it never considers
that a test's *voters* are separate placeholder identities (step 31
decision 3), each independently claimable via `claim_placeholder`. A
real, non-hypothetical sequence: a forum member claims their *voter*
identity while the *test creator's* identity (a different forum member)
stays unclaimed; this query's check passes (the test's own owner is
still a placeholder) and deletes the test anyway — cascading away the
now-real, claimed user's own vote in the process. The rewrite above
sidesteps this entirely: it's not a general safety net that has to
reason about partial-claim states at all, just a targeted response to
an explicit, verified request naming exactly whose data to remove.

</details>

---
