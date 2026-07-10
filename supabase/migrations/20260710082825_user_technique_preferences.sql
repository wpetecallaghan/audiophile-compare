-- Step 45: per-user listening technique preferences. A user can choose
-- which of the active listening_techniques they want offered when voting
-- on a blind test (minimum 1, all enabled by default).
--
-- "No rows for a user" means "all active techniques enabled" — not "zero
-- enabled". A save always writes the user's complete current selection
-- (delete-all-then-insert-all from application code, not incremental), so
-- there's never an ambiguity between "never customized" and "customized
-- down to nothing" to resolve here; the empty-rows state is always a
-- valid, meaningful default, not corruption. No signup-time trigger
-- populates this table — handle_new_user only ever created the users row
-- itself, and there's no need to change that for a table whose absence
-- already has a well-defined meaning.
create table public.user_technique_preferences (
  user_id      uuid not null references public.users(id) on delete cascade,
  technique_id uuid not null references public.listening_techniques(id) on delete cascade,
  primary key (user_id, technique_id)
);

alter table public.user_technique_preferences enable row level security;

-- Private preference data, unlike systems/votes — no public read policy.
-- Single "for all" policy (Postgres uses USING for WITH CHECK too when
-- WITH CHECK is omitted on a FOR ALL policy), same shape as
-- "systems: owner full access".
create policy "user_technique_preferences: owner full access"
  on public.user_technique_preferences for all using (user_id = auth.uid());

-- Extend claim_placeholder (20260709145657_claim_placeholder.sql) with
-- this new FK to public.users(id) — that migration's own comment
-- describes its reassignment list as "all six found by step 38's
-- exhaustive check"; this table adds a seventh. In practice a placeholder
-- never sets preferences itself (placeholders never log in), so this can
-- never actually fire today, but leaving claim_placeholder incomplete
-- against its own stated exhaustiveness would be a real, if currently
-- dormant, gap. The original migration is left untouched — this is a new
-- migration layering a replacement function body on top of it, same
-- pattern build-history/32-import-provenance-ui.md used to extend
-- ingest_test.
create or replace function public.claim_placeholder(placeholder_user_id uuid, real_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_systems_reassigned              int;
  v_tests_reassigned                int;
  v_tracks_reassigned               int;
  v_comments_reassigned             int;
  v_votes_reassigned                int;
  v_votes_dropped_collision         int;
  v_technique_prefs_reassigned      int;
  v_technique_prefs_dropped_collision int;
  v_import_authors_repointed        int;
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

  -- Same collision shape as votes above: user_id is part of
  -- user_technique_preferences' own primary key (user_id, technique_id),
  -- so drop the placeholder's preference row wherever the real user
  -- already has one for the same technique before reassigning the rest.
  delete from public.user_technique_preferences
  where user_id = placeholder_user_id
    and technique_id in (
      select technique_id from public.user_technique_preferences where user_id = real_user_id
    );
  get diagnostics v_technique_prefs_dropped_collision = row_count;

  update public.user_technique_preferences set user_id = real_user_id where user_id = placeholder_user_id;
  get diagnostics v_technique_prefs_reassigned = row_count;

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
    'technique_prefs_reassigned', v_technique_prefs_reassigned,
    'technique_prefs_dropped_collision', v_technique_prefs_dropped_collision,
    'import_authors_repointed', v_import_authors_repointed
  );
end;
$$;

-- SECURITY-CRITICAL: re-affirm the same lockdown every create or replace
-- of this function needs — Supabase grants EXECUTE to anon/authenticated
-- by default on a function replacement, same as on first creation.
revoke all on function public.claim_placeholder(uuid, uuid) from public;
revoke all on function public.claim_placeholder(uuid, uuid) from anon;
revoke all on function public.claim_placeholder(uuid, uuid) from authenticated;
grant execute on function public.claim_placeholder(uuid, uuid) to service_role;
