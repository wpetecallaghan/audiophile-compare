---
name: audiophile-compare-build-history-ingestion-39
description: Forum ingestion step 39 — Claim flow (merge a placeholder into a real account).
---

# ✅ 39 — Claim flow (merge a placeholder into a real account)

**Reviewed and revised against step 38's actual, now-built
implementation — per instruction, step 38 overrides this plan wherever
they conflict.** This plan was originally written before step 38
existed. Three real conflicts/gaps found and fixed: decision 4's FK
reassignment list was missing a column (`comments.user_id`) step 38's
own exhaustive schema check turned up; decision 4's explicitly-flagged
open question (does deleting `auth.users` cascade to `public.users`?)
is now answered — no, confirmed by building and testing
`erase_user_account`; and the function/application-code split plus the
`import_authors`-before-`public.users` deletion order are now stated
precisely, matching `erase_user_account`'s proven shape, instead of
being implicit/unverified. Decision 7 now cites `api-conventions.md`
Rule 8 (written *for* this situation, during step 38) instead of an
informal echo of `/version`'s gate. Decision 8 (the provenance-UI
contact link) turned out to already be built. Decision 9 (preview
before merge) is new — a recommendation carried over from step 38's UX
pattern, not a hard requirement. See each decision below for specifics.

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

4. **Revised — step 38 overrides this decision's original shape in three
   concrete ways, all settled by what was actually built and proven, not
   assumed.** The merge is a `security definer` Postgres function,
   `claim_placeholder(placeholder_user_id uuid, real_user_id uuid) returns
   jsonb`, called via the admin/service-role client — mirroring
   `ingest_test`'s design (step 31) *and* step 38's `erase_user_*`
   functions, not hand-rolled ordered updates from a route.

   - **Reassignment list corrected to five columns, not four.** Step 38
     checked every FK to `public.users(id)` exhaustively (not just the
     ones its own three scenarios happened to mention) and found six:
     `systems.owner_id`, `tracks.created_by`, `tests.creator_id`,
     `votes.user_id`, `comments.user_id`, `import_authors.user_id`. This
     decision's original list — `systems.owner_id`, `tests.creator_id`,
     `tracks.created_by`, `votes.user_id` — missed `comments.user_id`
     entirely (the fifth of six; `import_authors` is the sixth, handled
     separately below). For a genuine claim, a comment is this person's
     own authored content and should be *reassigned*, exactly like a
     vote — `update comments set user_id = real_user_id where user_id =
     placeholder_user_id`, alongside the other four reassignments.
   - **The previously-open question is now closed, confirmed by step
     38, not just re-asked here.** "Whether `public.users` needs an
     explicit companion delete or already cascades from the `auth.users`
     delete" — confirmed no: `public.users.id` is a bare `uuid primary
     key` with no FK relationship to `auth.users` at all (checked
     directly, not assumed, while building `erase_user_account`).
     `claim_placeholder` must include its own explicit
     `delete from public.users where id = placeholder_user_id` as part
     of the same atomic function — there is no cascade to rely on.
   - **Function/application-code boundary, now proven by
     `erase_user_account`'s exact working shape, not guessed.** The SQL
     function does everything transactional: the five reassignments,
     repointing (not deleting) `import_authors`, then deleting
     `public.users`. `admin.auth.admin.deleteUser(placeholder_user_id)`
     is a *separate*, subsequent call from application code (the route)
     — an Admin SDK call can't run inside a SQL function (same
     constraint `create-placeholder-author.ts` and `erase_user_account`
     already work within), and it runs *after* the SQL function
     succeeds, mirroring `erase_user_account`'s proven order exactly.
   - **A real sequencing hazard, invisible until step 38 proved the
     mechanism — worth stating explicitly, not left implicit in prose
     order.** `import_authors.user_id references public.users(id) on
     delete cascade`. If `public.users` were deleted *before*
     `import_authors` is repointed, the cascade would fire and delete
     the very mapping this decision exists to preserve — silently
     defeating step 30's "permanent, accurate record" design instead of
     erroring loudly. `claim_placeholder` must repoint `import_authors`
     strictly before deleting `public.users`, every time, not as an
     incidental consequence of write order but as a load-bearing
     constraint worth a code comment in the migration itself.

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
   admin client — not `INGEST_SECRET`. Revised: follow the now-documented
   `api-conventions.md` Rule 8 exactly, not an informal echo of
   `/version`'s gate.** Rule 8 ("admin-gated routes/pages") was written
   *for* this exact situation while building step 38 — it gives the
   precise response shapes to match: `401 {"error": "Unauthorised"}` for
   no session, `404` (not `403`) for an authenticated non-admin, on both
   the page (`notFound()`/`redirect()`) and the route
   (`NextResponse.json`). `app/api/admin/claim/route.ts` checks
   `isAdminEmail(user.email)` first, then calls `createAdminClient()` to
   invoke `claim_placeholder` — same shape `app/api/admin/
   erase-user-data/route.ts` already established as the second real
   caller of Rule 8, not just the cron route's secret-based analogy.

8. **Already done — not this step's work.** Step 32's provenance UI
   addendum (a contact link next to the existing badge, "Think this is
   yours? Contact ... to claim it.") is already implemented: `messages/
   en.json`'s `common.claimContact`, wired into `app/tests/[id]/
   page.tsx`, documented in `build-history/32-import-provenance-ui.md`. Confirmed by
   checking the real files, not assumed from the plan text alone.
   Nothing for this step to build here.

9. **Recommended addition, not a hard requirement — preview before
   merge, matching step 38's now-established UX pattern.** Step 38
   decision 8 added a read-only preview (real counts) before its
   irreversible action, specifically because an admin acting on a
   destructive/hard-to-reverse operation benefits from seeing the blast
   radius first. A claim is equally hard to reverse (there's no
   "un-merge" once `public.users`/`auth.users` for the placeholder are
   gone) — worth the admin route/page showing how many
   systems/tests/votes/comments/tracks will be reassigned before the
   admin confirms, mirroring `EraseUserDataForm`'s two-step
   preview-then-`ConfirmButton` flow directly. Flagged as a
   recommendation to adopt for consistency, not a decision this rewrite
   forces — worth confirming before build, same as any other open
   decision in this plan.

**Files to update:**
- New migration — `claim_placeholder(placeholder_user_id uuid, real_user_id
  uuid) returns jsonb` (five reassignments + `import_authors` repoint +
  `public.users` delete, in that order — decision 4), plus `revoke`/
  `grant` matching `ingest_test`/`erase_user_*`'s pattern.
- `app/api/admin/claim/route.ts` (new) — Rule 8-shaped gate (decision 7);
  calls `claim_placeholder` then `admin.auth.admin.deleteUser()`
  afterward, same two-step order `erase-user-data/route.ts`'s `'full'`
  scope already established.
- `app/admin/claim/page.tsx` (new) — a minimal form (placeholder
  identifier, real user identifier), gated by `isAdminEmail`; consider
  reusing `EraseUserDataForm.tsx`'s preview-then-`ConfirmButton` shape
  if decision 9's recommendation is adopted.
- ~~`build-history/32-import-provenance-ui.md` — addendum noting the contact link~~ —
  already done (decision 8), nothing to do here.
- `audiophile-compare-schema.md` — new function section immediately
  after "Data erasure functions (step 38)" (same format: what it does,
  security-critical EXECUTE note), following that section's own
  established precedent rather than inventing new formatting.
- `api-conventions.md` — Rule 8 gains a third caller
  (`app/api/admin/claim/route.ts`), not a new rule; Rule 6's "not
  absolute" note could mention this alongside step 38's exception if it
  reads naturally once built.
- `components.md`, `testing.md`, `core.md` — per the usual pattern, once
  built; `testing.md` §7's step 38 paragraph is the template for how to
  describe this step's own integration test file once it exists.

**Tests:**
- **Integration — corrected precedent: mirror step 38's actual working
  pattern, not step 31's.** Step 31's `route.integration.test.ts` fakes
  its route's auth by setting `process.env.INGEST_SECRET` directly,
  which only works because that route's auth is header-based. This
  route's auth is session-based, the same as `erase-user-data/route.ts`
  — call `claim_placeholder` directly via `.rpc(...)`, not by importing
  and calling the route handler. Cases: reassigns all *five* FK columns
  (systems/tests/tracks/votes/comments — decision 4's corrected list);
  repoints (not deletes) `import_authors`, confirmed still pointing at
  the *real* user afterward; deletes the placeholder's `public.users`
  row and confirms `admin.auth.admin.deleteUser()` still succeeds
  afterward against the now-orphaned auth identity (exact same
  assertion shape as `erase_user_account`'s own test); correctly skips
  a colliding vote (`UNIQUE (test_id, user_id, technique_id)`) rather
  than erroring the whole merge; EXECUTE lockdown confirmed directly
  against staging with an anon-key client, same as step 38.
- **Manual, not automated** (same reasoning step 38's own "Verified"
  section used): the route's own auth gate (401/404) — `curl` it
  directly, or reuse a saved E2E storageState cookie against a local dev
  server for a real authenticated-non-admin check, same trick step 38
  used to verify its gate for real.
- **E2E:** none — an admin-only backend operation behind a minimal form,
  not a public flow needing browser-driven coverage at this stage.

**Built, exactly per the plan above, decision 9 adopted (preview before
merge):**
- `supabase/migrations/20260709145657_claim_placeholder.sql` —
  `claim_placeholder(placeholder_user_id, real_user_id)`, five content FK
  reassignments (`systems.owner_id`, `tests.creator_id`,
  `tracks.created_by`, `comments.user_id`, `votes.user_id` with the
  collision-drop-then-reassign two-step decision 5 requires), `import_authors`
  repointed strictly before the `public.users` delete (the ordering
  hazard decision 4 flagged, now a load-bearing code comment in the
  migration itself, not just prose here), `revoke`/`grant execute ... to
  service_role` lockdown matching `ingest_test`/`erase_user_*` exactly.
- `app/api/admin/claim/route.ts` — Rule 8 gate, `preview` branch (five
  read-only counts), real branch calling `claim_placeholder` then
  `admin.auth.admin.deleteUser(placeholderUserId)` afterward, same
  two-step order `erase-user-data/route.ts`'s `'full'` scope uses.
- `app/admin/claim/page.tsx` + `components/admin/ClaimPlaceholderForm.tsx`
  — same session+isAdminEmail gate as `erase-user-data`'s page;
  `ClaimPlaceholderForm.tsx` copies `EraseUserDataForm.tsx`'s
  preview-then-`ConfirmButton` shape directly (two text inputs instead
  of one, no scope selector — a claim only ever has one shape).
- `messages/en.json` — `admin.claim` namespace added alongside
  `admin.eraseUserData`.
- `app/api/admin/claim/__tests__/route.integration.test.ts` — 3 tests,
  calling `claim_placeholder` directly via `.rpc(...)` per the corrected
  precedent above: full reassignment (all five columns + `import_authors`
  repoint + placeholder deletion + `admin.auth.admin.deleteUser()`
  succeeding afterward), the vote-collision-drop case, and the
  anon-key EXECUTE-lockdown rejection.
- Docs updated: `audiophile-compare-schema.md` (new "Claim function (step
  39)" section, mirroring "Data erasure functions (step 38)"'s format),
  `api-conventions.md` Rule 8 (third caller), `components.md`
  (`ConfirmButton` usage note), `testing.md` §7 and §11 (new integration
  test paragraph), `core.md` §6 (build status).

**Verified:** the user applied the migration to both environments
(`supabase db push`, their own action, not the assistant's). Independently
re-checked, not just taken on report — `supabase migration list` shows
`20260709145657` applied on both `audiophile-staging`
(`ihszzvrloncidegvpipa`) and `audiophile-prod` (`qbfflasfqjmvwdvaeaja`),
checked directly by relinking the CLI to each project in turn (then
relinking back to staging, the state it was found in). `npm run
test:integration` run for real against staging: all 3 claim tests pass,
plus the other two integration files unaffected (17/17 total). Typecheck
and the full unit suite (38 files/440 tests) re-run clean, no
regressions. The admin route's gate manually curl-verified for real
against a local dev server: no session → 401 `{"error":
"Unauthorised"}`; the saved E2E storageState cookie (an authenticated,
non-admin session) → 404 `{"error": "Not found"}` — both match Rule 8
exactly. Deployed to `Dev`, `Staging`, and `main` alongside step 41
(`6cb757c`) — the code was already committed (`027115f`/`1432bae`) by the
time that push went out, so it shipped as part of the same deploy rather
than needing a separate one. The one gap the assistant couldn't close
directly — the authenticated-admin happy path itself, no real admin
credentials available in this environment — is now closed: the real
admin account confirmed `/admin/claim` presents and works correctly on
all deployments, the same closing step step 38 needed for
`/admin/erase-user-data`.
