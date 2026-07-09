-- Step 39 (claim flow): merges a placeholder account (an imported forum
-- author who hasn't joined the app) into a real, registered account —
-- see build-history-ingestion.md step 39 for the full design/rationale.
-- Admin-triggered, human-verified (forum PM confirms identity), not
-- self-service — mirrors step 38's erase_user_* functions' shape exactly
-- (security definer, called via the admin/service-role client, revoked
-- from anon/authenticated).
--
-- claim_placeholder(placeholder_user_id, real_user_id) reassigns every
-- FK reference to public.users(id) — all six found by step 38's
-- exhaustive check, not just the ones a claim scenario happens to
-- mention: systems.owner_id, tests.creator_id, tracks.created_by,
-- votes.user_id, comments.user_id (reassigned — this is the
-- placeholder's own content, now the real user's) and
-- import_authors.user_id (repointed — this row IS the provenance record
-- being preserved, not the placeholder's content).
--
-- Votes: a collision (the real user already voted the same
-- (test_id, technique_id) the placeholder did) is resolved in the real
-- user's favour — their own vote wins, the placeholder's colliding vote
-- is dropped rather than erroring the whole merge (decision 5).
--
-- Ordering is load-bearing, not incidental: import_authors.user_id
-- references public.users(id) on delete cascade (see
-- 20260707123521_placeholder_authors.sql). If public.users were deleted
-- before import_authors is repointed to real_user_id, the cascade would
-- fire and delete the very mapping this function exists to preserve —
-- silently defeating step 30's "permanent, accurate record" design
-- instead of erroring loudly. import_authors MUST be repointed strictly
-- before the public.users delete, every time.
--
-- public.users.id has no FK relationship to auth.users at all (confirmed
-- while building erase_user_account, step 38) — no cascade to rely on,
-- so this function's own explicit delete is the only thing that removes
-- the placeholder's public.users row.
-- admin.auth.admin.deleteUser(placeholder_user_id) is a separate,
-- subsequent call from application code (the route) — an Admin SDK call
-- can't run inside a SQL function, same constraint
-- create-placeholder-author.ts and erase_user_account already work
-- within — and it runs after this function succeeds.
create or replace function public.claim_placeholder(placeholder_user_id uuid, real_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_systems_reassigned         int;
  v_tests_reassigned           int;
  v_tracks_reassigned          int;
  v_comments_reassigned        int;
  v_votes_reassigned           int;
  v_votes_dropped_collision    int;
  v_import_authors_repointed   int;
begin
  update public.systems set owner_id = real_user_id where owner_id = placeholder_user_id;
  get diagnostics v_systems_reassigned = row_count;

  update public.tests set creator_id = real_user_id where creator_id = placeholder_user_id;
  get diagnostics v_tests_reassigned = row_count;

  update public.tracks set created_by = real_user_id where created_by = placeholder_user_id;
  get diagnostics v_tracks_reassigned = row_count;

  update public.comments set user_id = real_user_id where user_id = placeholder_user_id;
  get diagnostics v_comments_reassigned = row_count;

  -- Drop the placeholder's vote wherever the real user already voted the
  -- same (test_id, technique_id) — the real user's own vote wins
  -- (decision 5) — before reassigning what's left, so the reassigning
  -- update below can never hit the UNIQUE (test_id, user_id,
  -- technique_id) constraint.
  delete from public.votes
  where user_id = placeholder_user_id
    and (test_id, technique_id) in (
      select test_id, technique_id from public.votes where user_id = real_user_id
    );
  get diagnostics v_votes_dropped_collision = row_count;

  update public.votes set user_id = real_user_id where user_id = placeholder_user_id;
  get diagnostics v_votes_reassigned = row_count;

  -- Repoint the provenance record BEFORE deleting public.users — see the
  -- ordering note above. This is preserving the mapping, not reassigning
  -- content: the row itself continues to record "this real user's
  -- content originally came from this external forum identity."
  update public.import_authors set user_id = real_user_id where user_id = placeholder_user_id;
  get diagnostics v_import_authors_repointed = row_count;

  delete from public.users where id = placeholder_user_id;

  return jsonb_build_object(
    'systems_reassigned', v_systems_reassigned,
    'tests_reassigned', v_tests_reassigned,
    'tracks_reassigned', v_tracks_reassigned,
    'comments_reassigned', v_comments_reassigned,
    'votes_reassigned', v_votes_reassigned,
    'votes_dropped_collision', v_votes_dropped_collision,
    'import_authors_repointed', v_import_authors_repointed
  );
end;
$$;

-- SECURITY-CRITICAL: bypasses RLS by necessity (reassigning another
-- user's rows and deleting a public.users row is not something any
-- normal session should ever do) — same lockdown discipline as
-- ingest_test and the erase_user_* functions. Supabase grants EXECUTE to
-- anon/authenticated by default on new functions; explicitly revoked
-- here, granted only to service_role.
revoke all on function public.claim_placeholder(uuid, uuid) from public;
revoke all on function public.claim_placeholder(uuid, uuid) from anon;
revoke all on function public.claim_placeholder(uuid, uuid) from authenticated;
grant execute on function public.claim_placeholder(uuid, uuid) to service_role;
