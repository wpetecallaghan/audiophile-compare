-- Step 38 (data erasure requests): three security-definer functions
-- supporting admin-triggered, human-verified removal of a user's data —
-- see build-history-ingestion.md step 38 for the full design/rationale.
-- Not the same thing as scripts/rollback-lejonklou.ts (an interim
-- ingestion-pipeline-only tool, unrelated to this step).
--
-- erase_user_votes(target_user_id)   -- case 1: votes only
-- erase_user_content(target_user_id) -- case 2: tests + systems
-- erase_user_account(target_user_id) -- case 3's final step: the account
--   itself (call after both functions above, then
--   admin.auth.admin.deleteUser() from application code — the Admin SDK
--   call can't run inside a SQL function).
--
-- Schema change required first: tracks.created_by was `not null
-- references public.users(id)` with no cascade, and tracks are
-- deliberately never deleted (they're globally shared, matched by
-- (artist, title) — decision 3). If the erased user ever created a
-- track — even one a different, surviving test still uses — deleting
-- their public.users row would fail outright with a foreign-key
-- violation. Checked whether created_by is ever read anywhere before
-- deciding how to resolve this: it's write-only (app/api/tracks/
-- route.ts), never displayed or joined anywhere in the app. Safe to
-- null out instead of blocking the delete.
alter table public.tracks alter column created_by drop not null;

-- erase_user_votes: deletes every vote this user cast, wherever cast.
-- "As if they had never voted" — case 1's literal request.
create or replace function public.erase_user_votes(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_votes_deleted int;
begin
  delete from public.votes where user_id = target_user_id;
  get diagnostics v_votes_deleted = row_count;

  return jsonb_build_object('votes_deleted', v_votes_deleted);
end;
$$;

-- erase_user_content: deletes every test this user created and every
-- system they own, fully — "as if that content had never been
-- imported/created." case 2's literal request.
--
-- Deleting a user's own systems alongside their tests is always safe —
-- verified as a real schema invariant, not assumed: both ingest_test
-- and the web wizard's own route (app/api/tests/route.ts) guarantee a
-- test's snapshots always belong to systems owned by that same test's
-- creator, so no test in this schema can ever reference another user's
-- system. Once this user's own tests are gone, deleting their systems
-- can't orphan or affect anyone else's data.
--
-- FK-safe order (same as testing.md §5's E2E teardown order, and what
-- lib/ingestion/rollback.ts already reuses independently): comments and
-- votes (by *anyone*, on these specific tests — the test is going away
-- entirely, not being edited) -> clip_mapping -> clips -> tests ->
-- system_snapshots -> systems. Tracks are never touched (decision 3 —
-- globally shared, matched by (artist, title), created_by is
-- provenance, not ownership).
create or replace function public.erase_user_content(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_votes_deleted   int;
  v_tests_deleted   int;
  v_systems_deleted int;
begin
  delete from public.comments
  where test_id in (select id from public.tests where creator_id = target_user_id);

  delete from public.votes
  where test_id in (select id from public.tests where creator_id = target_user_id);
  get diagnostics v_votes_deleted = row_count;

  delete from public.clip_mapping
  where test_id in (select id from public.tests where creator_id = target_user_id);

  delete from public.clips
  where test_id in (select id from public.tests where creator_id = target_user_id);

  delete from public.tests where creator_id = target_user_id;
  get diagnostics v_tests_deleted = row_count;

  delete from public.system_snapshots
  where system_id in (select id from public.systems where owner_id = target_user_id);

  delete from public.systems where owner_id = target_user_id;
  get diagnostics v_systems_deleted = row_count;

  return jsonb_build_object(
    'tests_deleted', v_tests_deleted,
    'systems_deleted', v_systems_deleted,
    'votes_deleted', v_votes_deleted
  );
end;
$$;

-- erase_user_account: the final step of case 3 (a registered user's full
-- data-and-account deletion) — clears every remaining reference to
-- target_user_id so public.users can actually be deleted, then deletes
-- it. Only ever meant to be called for a real, non-placeholder user as
-- part of the admin route's "full" scope (see build-history-ingestion.md
-- step 38 decision 5 for why a placeholder's identity is never deleted
-- this way) — not enforced as a hard precondition here, same reasoning
-- as the other two functions: the safety boundary is the admin route
-- plus human verification, not a SQL-level guard, since that would also
-- block this function's own legitimate use.
--
-- Two remaining FK references to public.users(id) have to be cleared
-- before the delete, found by checking every FK to that table, not just
-- the ones the three erasure scenarios explicitly mentioned:
-- - tracks.created_by: nulled, not deleted (see the ALTER above — a
--   track is shared, its creator is provenance, not ownership).
-- - comments.user_id: deleted outright, not nulled (a comment is this
--   user's own authored content, like a vote — currently always zero
--   rows in practice, since nothing in the app reads or writes
--   `comments` yet, but the identical failure mode as tracks would
--   otherwise reappear silently the moment that feature ships).
-- import_authors.user_id already has `on delete cascade` (see
-- 20260707123521_placeholder_authors.sql) — nothing to do there, though
-- this function is never meant to run against a placeholder in the
-- first place.
create or replace function public.erase_user_account(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracks_orphaned int;
  v_deleted         int;
begin
  update public.tracks set created_by = null where created_by = target_user_id;
  get diagnostics v_tracks_orphaned = row_count;

  delete from public.comments where user_id = target_user_id;

  delete from public.users where id = target_user_id;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('tracks_orphaned', v_tracks_orphaned, 'account_deleted', v_deleted > 0);
end;
$$;

-- SECURITY-CRITICAL: all three functions bypass RLS by necessity
-- (deleting another user's rows is not something any normal session
-- should ever do) — same lockdown discipline as ingest_test. Supabase
-- grants EXECUTE to anon/authenticated by default on new functions;
-- explicitly revoked here, granted only to service_role.
revoke all on function public.erase_user_votes(uuid) from public;
revoke all on function public.erase_user_votes(uuid) from anon;
revoke all on function public.erase_user_votes(uuid) from authenticated;
grant execute on function public.erase_user_votes(uuid) to service_role;

revoke all on function public.erase_user_content(uuid) from public;
revoke all on function public.erase_user_content(uuid) from anon;
revoke all on function public.erase_user_content(uuid) from authenticated;
grant execute on function public.erase_user_content(uuid) to service_role;

revoke all on function public.erase_user_account(uuid) from public;
revoke all on function public.erase_user_account(uuid) from anon;
revoke all on function public.erase_user_account(uuid) from authenticated;
grant execute on function public.erase_user_account(uuid) to service_role;
