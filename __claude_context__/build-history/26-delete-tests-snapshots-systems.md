---
name: audiophile-compare-build-history-26
description: Build step 26 — Delete tests, snapshots, and systems.
---

# ✅ 26 — Delete tests, snapshots, and systems

User-requested rules: a creator can delete a **test** they created, but
only if it has **zero votes recorded** — listening is a real time
commitment, so once a vote exists it must be respected and the test is
frozen forever (no delete, presumably no further edits either, though
nothing about tests is currently editable post-creation anyway). A creator
can delete a **snapshot** they created only if it has no undeleted tests
referencing it (as `snapshot_a_id` or `snapshot_b_id`). A creator can
delete a **system** they created only if it has no undeleted snapshots.
Built per plan below, plus two things the plan missed — see "Deviations
from the plan" at the end.

**Decision: hard delete (real `DELETE`), relying on the existing foreign
keys' default `RESTRICT` behavior for the cascade ordering — not soft
delete.**

This reverses an earlier pass at this plan (see git history / prior version
of this section), which landed on soft delete via a `deleted_at` column.
That reasoning was entirely about protecting *other users'* votes from a
unilateral delete by the test creator. The vote rule above makes that
protection categorical and unconditional instead: a test with any vote can
never be deleted, full stop — so a test that *is* eligible for deletion is,
by definition, one where nothing but the creator's own `clips`/
`clip_mapping` rows are at stake. Hard-deleting it destroys no one else's
data.

That protection propagates upward for free, by referential integrity, not
just convention: a snapshot can only be deleted once every test that used
it is gone — meaning every one of those tests was either always vote-free
and already deleted, or never existed. Either way, no vote was ever
attached to that snapshot, so hard-deleting it is equally safe. Same logic
covers systems one level up. **No `deleted_at` column, no RLS read-policy
changes, and no new "is this really gone" bookkeeping anywhere** — a plain
`DELETE` plus the database's own existing `REFERENCES` constraints (default
`NO ACTION`, which behaves like `RESTRICT`) already refuse to remove a
snapshot/system while a child row still exists. The one already-decided
piece that carries over unchanged: no restore/undo UI, since a hard delete
has no "undo" to build in the first place.

**Clips are not shared rows — confirmed against the actual cross-check
code, not just the schema doc.** `clips.test_id` is `NOT NULL REFERENCES
tests(id)`; every test, including cross-check tests, gets its own brand-new
pair of `clips` rows. `app/api/tests/cross-check/route.ts` copies the
`source_url`/`provider`/`media_type` *string values* from an existing clip
into fresh rows scoped to the new test — it never re-links an existing
`clips.id`. `lib/clips/find-shared-clips.ts`'s "shared" refers to sharing
the same underlying **track** (recording) across two systems' tests, not a
shared clip row. So there is no scenario where deleting a test's clips
could orphan a clip still used by another test, and no clip-deduplication
work is in scope for this step — each clip already belongs to exactly one
test.

**Schema migration needed — not for the tests/snapshots/systems FKs
themselves (already correctly restrictive by default with no migration
required), but for `clips` and `clip_mapping`, which need `ON DELETE
CASCADE` added to their `test_id` foreign key.** Unlike votes, `clips` and
`clip_mapping` rows are wholly owned by the test — created together with
it, never independently meaningful — so cascading their deletion is correct
and safe, not a repeat of the votes problem:
```sql
ALTER TABLE public.clips
  DROP CONSTRAINT clips_test_id_fkey,
  ADD CONSTRAINT clips_test_id_fkey
    FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;

ALTER TABLE public.clip_mapping
  DROP CONSTRAINT clip_mapping_test_id_fkey,
  ADD CONSTRAINT clip_mapping_test_id_fkey
    FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;
```
(Constraint names confirmed exactly as written via a direct `pg_constraint`
query against staging before writing the migration — no `\d` guessing
needed.)
`votes.test_id` deliberately keeps its default (non-cascading) foreign key
as a **second, database-enforced layer of protection**: even if the
app-layer "zero votes" check had a bug, the database itself would still
refuse to delete a test that a vote row references.

**New/updated API routes** (mirroring the existing `PATCH` handlers'
auth/ownership pattern — 401 unauthenticated, 404 on any ownership
mismatch to avoid leaking existence):
- `DELETE /api/tests/[id]` (new) — creator only; 409 if `votes` has any row
  for this `test_id`; else deletes the test (cascading to its own `clips`/
  `clip_mapping`).
- `DELETE /api/systems/[id]/snapshots/[snapshotId]` (new handler on the
  existing route file) — system-owner only; app-layer pre-check returns 409
  if any test still has this snapshot as `snapshot_a_id`/`snapshot_b_id`
  (giving a friendly error), backed by the DB's own FK `RESTRICT` as a
  second layer; else deletes the snapshot.
- `DELETE /api/systems/[id]` (new handler on the existing route file) —
  owner only; same pattern — 409 if any snapshot still references this
  system, else delete.

**Reads need no changes** — a deleted row is simply gone, so the home feed,
track detail's test list, systems list/detail, and both snapshot pickers
(`CrossCheckSelector.tsx`, `steps/StepSnapshots.tsx`) all keep working
exactly as they do today with no new filter to add or forget.

**UI:** a "Delete" action on the test detail page (creator only, hidden
once `voteCount > 0` — the page already computes this for the existing
vote-count display), the snapshot list in `SnapshotSection.tsx` (owner
only, hidden once any test references it), and the system detail page
(owner only, hidden once any snapshot exists) — all proactively hidden, not
just left to fail on submit, since each page already has the relevant
child count in hand (`app/systems/[id]/page.tsx` already fetches every
snapshot's tests to render the existing lists; `system_snapshots.length`
gives the system's own count for free).

The plan said to reuse `RevealButton.tsx`'s two-step confirm pattern —
that held, but the pattern itself moved. With three new call sites
(`DeleteTestButton.tsx`, `SnapshotSection.tsx`, `DeleteSystemButton.tsx`)
needing the exact same confirm/cancel interaction as `RevealButton.tsx`,
copy-pasting a fourth ~25-line block was worse than extracting it once it
actually repeated — see `components/ui/ConfirmButton.tsx` and
`components.md`'s new entry for it. `RevealButton.tsx` itself was
refactored to use it too, so there's now exactly one implementation of
this interaction, not four.

**Deviations from the plan (found during implementation, not anticipated
by it):**

1. **The plan said "no RLS policy changes" but meant read policies only —
   there were no DELETE policies at all.** `tests`, `clips`, and
   `clip_mapping` only had select/insert/update RLS policies; `system_snapshots`
   only had select/insert/update too (`systems` was the only one of the
   five with a blanket `for all` policy already covering delete). Without a
   delete policy, RLS silently blocks both a direct `DELETE` and — this is
   the sharper trap — the `ON DELETE CASCADE` this step's other migration
   depends on, since a cascaded delete is still subject to RLS for the
   acting role. Fixed with a second migration
   (`20260707074919_delete_rls_policies.sql`) adding `tests: creator
   delete`, `clips: test creator delete`, `clip_mapping: test creator
   delete`, and `snapshots: owner delete`. Also documented as
   `api-conventions.md` Rule 5 (extended) and Rule 6 (new).
2. **Staging's migration history had already drifted before this step
   started** — a function (`public.test_vote_counts`, a bulk variant of
   `test_vote_count` for the feed page) existed on staging but was never
   committed as a migration file, so `supabase db push` refused to run
   until reconciled: `supabase migration repair --status reverted
   20260630163029` (bookkeeping only, does not touch schema) to clear the
   phantom remote entry. Adopting that drift into a local migration file
   via `supabase db pull` was attempted but needs Docker for its shadow
   database, unavailable in this environment — left as a follow-up, not
   blocking this step.

**Migrations applied to staging only** (`audiophile-staging`), not
production, per the documented "staging first" deployment topology:
`20260707074426_cascade_delete_clips_and_mapping.sql` and
`20260707074919_delete_rls_policies.sql`.

**Tests:**
- **Unit:** no new file — extended the existing
  `components/systems/__tests__/SnapshotSection.test.tsx` (20 → 27 tests)
  with a `Delete` describe block: shown for owner with zero referencing
  tests, hidden with a referencing test, hidden for non-owner, confirm/cancel
  step, successful `DELETE` + `router.refresh()`, server-error handling.
  `DeleteTestButton.tsx`/`DeleteSystemButton.tsx`/`ConfirmButton.tsx` have no
  dedicated unit tests, consistent with `RevealButton.tsx`'s existing
  precedent (e2e-only) and the rest of `components/ui/*` (no primitive there
  has its own unit test file either).
- **E2E:** new `e2e/tests/delete.spec.ts` (authenticated project), 6 tests —
  creator deletes a zero-vote test (redirects to `/`); Delete hidden once a
  vote exists; owner deletes an unreferenced snapshot; Delete hidden when a
  test references the snapshot; owner deletes a snapshot-less system
  (redirects to `/systems`); Delete hidden when the system has a snapshot.

**Verified:** `npm run test` — 25 files / 263 tests, all passing (up from
256; the 7 new are in `SnapshotSection.test.tsx`). `npx tsc --noEmit` — no
new errors (same 32 pre-existing, unrelated `__tests__/supabase-*.test.ts`
mock-typing failures as every prior step). `npm run test:e2e` — full suite
36/36 passing (30 pre-existing + 6 new), run against a local dev server
(`E2E_BASE_URL` overridden to `http://localhost:3000` — `.env.local`'s
default points at staging, which doesn't have this branch's code yet).
Confirmed via the teardown counts, not just UI assertions, that the
"successful delete" tests actually removed rows rather than merely hiding
them client-side. Migrations verified applied on staging via a direct
`pg_constraint`/`pg_policies` query (`confdeltype = 'c'` on both FKs, all
four new delete policies present) before any app-layer testing began.
