-- Forum ingestion follow-up: two real bugs found by manually reviewing
-- imported tests on staging after step 36's first real commit run.
--
-- 1. ingest_test always inserted status='open' and never set revealed_at,
--    regardless of whether the imported test carries any votes. Since
--    tests.status='revealed' is what actually gates the before/after
--    mapping and vote tally being visible (app/tests/[id]/page.tsx) and
--    what blocks new voting (app/api/votes/route.ts's 409 "Cannot vote
--    on a revealed test"), every imported historical test was silently
--    sitting open to a live visitor voting on a years-old forum clip.
--    Fixed: a test with at least one vote in its payload is inserted
--    already 'revealed' (revealed_at = now(), the commit time — the
--    real forum reveal date isn't separately tracked by the extraction
--    pipeline, only the test-defining post's own date is). A test with
--    zero votes stays 'open', same as before — nobody actually evaluated
--    it blind, so there's no historical answer to protect from a fresh
--    vote.
-- 2. tests.created_at always defaulted to now() (real ingestion time),
--    never the original forum post's date, even though extraction
--    already tracks that date on its own Candidate.created_at. Fixed:
--    accepts an optional created_at in the payload, falling back to
--    now() when absent (unchanged behavior for web-created tests, which
--    never set it).
--
-- IMPORTANT — regression this migration itself introduced and then fixed
-- before ever shipping: the first version of this file was written by
-- copying the *original* ingest_test body from
-- 20260707150400_ingest_test_function.sql, missing that
-- 20260707173905_tests_source_url.sql (step 32) had already layered
-- source_url support on top of it. Since create-or-replace fully replaces
-- the function, that first version would have silently dropped
-- tests.source_url from every future import (the "view original post"
-- link disappearing) — caught by a human reviewing real output on
-- staging, not by anything automated. v_source_url and the source_url
-- column are restored below alongside the two real fixes above.

create or replace function public.ingest_test(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_ref   text        := payload->>'source_ref';
  v_source_url   text        := payload->>'source_url';
  v_owner_id     uuid        := (payload->>'owner_id')::uuid;
  v_title        text        := payload->>'title';
  v_track        jsonb       := payload->'track';
  v_snapshot_a   jsonb       := payload->'snapshot_a';
  v_snapshot_b   jsonb       := payload->'snapshot_b';
  v_before_is_a  boolean     := (payload->>'before_is_a')::boolean;
  v_votes        jsonb       := coalesce(payload->'votes', '[]'::jsonb);
  v_created_at   timestamptz := coalesce((payload->>'created_at')::timestamptz, now());
  -- Declared after v_votes above — PL/pgSQL evaluates a DECLARE block's
  -- initializers in order, so referencing an already-declared variable
  -- here is safe and avoids repeating the same coalesce expression twice.
  v_status       text        := case when jsonb_array_length(v_votes) > 0 then 'revealed' else 'open' end;
  v_revealed_at  timestamptz := case when jsonb_array_length(v_votes) > 0 then now() else null end;

  v_existing_test_id uuid;
  v_track_id         uuid;
  v_system_a_id      uuid;
  v_system_b_id      uuid;
  v_snapshot_a_id    uuid;
  v_snapshot_b_id    uuid;
  v_test_id          uuid;
  v_clip_a_id        uuid;
  v_clip_b_id        uuid;
  v_next_version     int;
  v_vote             jsonb;
  v_technique_id     uuid;
  v_chosen_clip_id   uuid;
begin
  -- Idempotency: a prior run with this source_ref already completed.
  select id into v_existing_test_id from public.tests where source_ref = v_source_ref;
  if v_existing_test_id is not null then
    return jsonb_build_object('test_id', v_existing_test_id, 'already_imported', true);
  end if;

  -- Track: matched globally by (artist, title), case-insensitive — tracks
  -- were never per-owner in this schema.
  select id into v_track_id
  from public.tracks
  where lower(artist) = lower(v_track->>'artist')
    and lower(title) = lower(v_track->>'title')
  limit 1;

  if v_track_id is null then
    insert into public.tracks (created_by, artist, title, album, passage_note)
    values (
      v_owner_id,
      v_track->>'artist',
      v_track->>'title',
      v_track->>'album',
      v_track->>'passage_note'
    )
    returning id into v_track_id;
  end if;

  -- Snapshot A: system scoped to the resolved owner (two different forum
  -- members can both name a system "Living room rig"), snapshot matched by
  -- label within that system.
  select id into v_system_a_id
  from public.systems
  where owner_id = v_owner_id and lower(name) = lower(v_snapshot_a->>'system_name')
  limit 1;

  if v_system_a_id is null then
    insert into public.systems (owner_id, name)
    values (v_owner_id, v_snapshot_a->>'system_name')
    returning id into v_system_a_id;
  end if;

  select id into v_snapshot_a_id
  from public.system_snapshots
  where system_id = v_system_a_id and lower(label) = lower(v_snapshot_a->>'version_label')
  limit 1;

  if v_snapshot_a_id is null then
    select coalesce(max(version), 0) + 1 into v_next_version
    from public.system_snapshots where system_id = v_system_a_id;

    insert into public.system_snapshots (system_id, version, label, components)
    values (v_system_a_id, v_next_version, v_snapshot_a->>'version_label', v_snapshot_a->'components')
    returning id into v_snapshot_a_id;
  end if;

  -- Snapshot B: same pattern as snapshot A.
  select id into v_system_b_id
  from public.systems
  where owner_id = v_owner_id and lower(name) = lower(v_snapshot_b->>'system_name')
  limit 1;

  if v_system_b_id is null then
    insert into public.systems (owner_id, name)
    values (v_owner_id, v_snapshot_b->>'system_name')
    returning id into v_system_b_id;
  end if;

  select id into v_snapshot_b_id
  from public.system_snapshots
  where system_id = v_system_b_id and lower(label) = lower(v_snapshot_b->>'version_label')
  limit 1;

  if v_snapshot_b_id is null then
    select coalesce(max(version), 0) + 1 into v_next_version
    from public.system_snapshots where system_id = v_system_b_id;

    insert into public.system_snapshots (system_id, version, label, components)
    values (v_system_b_id, v_next_version, v_snapshot_b->>'version_label', v_snapshot_b->'components')
    returning id into v_snapshot_b_id;
  end if;

  -- Test row. status/revealed_at reflect whether this import already
  -- carries votes (see header comment); created_at is the real forum
  -- post date when the caller supplies one, now() otherwise; source_url
  -- (step 32) powers the "view original post" link.
  insert into public.tests (creator_id, track_id, snapshot_a_id, snapshot_b_id, title, status, revealed_at, created_at, source_ref, source_url)
  values (v_owner_id, v_track_id, v_snapshot_a_id, v_snapshot_b_id, v_title, v_status, v_revealed_at, v_created_at, v_source_ref, v_source_url)
  returning id into v_test_id;

  -- Clips — provider/media_type are pre-computed by the caller
  -- (lib/clips/detect-provider.ts); reachability was already verified by
  -- the scraper (step 33), not re-checked here (step 31 decision 7).
  insert into public.clips (test_id, label, source_url, provider, media_type, url_status)
  values (v_test_id, 'A', payload->>'clip_a_url', payload->>'clip_a_provider', payload->>'clip_a_media_type', 'ok')
  returning id into v_clip_a_id;

  insert into public.clips (test_id, label, source_url, provider, media_type, url_status)
  values (v_test_id, 'B', payload->>'clip_b_url', payload->>'clip_b_provider', payload->>'clip_b_media_type', 'ok')
  returning id into v_clip_b_id;

  -- Clip mapping — before/after identity.
  insert into public.clip_mapping (test_id, before_clip_id, after_clip_id)
  values (
    v_test_id,
    case when v_before_is_a then v_clip_a_id else v_clip_b_id end,
    case when v_before_is_a then v_clip_b_id else v_clip_a_id end
  );

  -- Votes — each vote already carries its own resolved voter user_id
  -- (a distinct placeholder per commenter, not the post author — see
  -- step 31 decision 3). A duplicate (test_id, user_id, technique_id) from
  -- the same voter is silently skipped rather than aborting the whole
  -- import — the first vote still counts, matching "one vote per user per
  -- technique per test" without discarding an otherwise-valid payload.
  for v_vote in select * from jsonb_array_elements(v_votes)
  loop
    select id into v_technique_id
    from public.listening_techniques
    where lower(name) = lower(v_vote->>'technique_name')
    limit 1;

    if v_technique_id is null then
      raise exception 'ingest_test: unknown listening technique "%"', v_vote->>'technique_name';
    end if;

    v_chosen_clip_id := case when v_vote->>'chosen_label' = 'A' then v_clip_a_id else v_clip_b_id end;

    insert into public.votes (test_id, user_id, chosen_clip_id, technique_id, other_description, observation)
    values (
      v_test_id,
      (v_vote->>'user_id')::uuid,
      v_chosen_clip_id,
      v_technique_id,
      v_vote->>'other_description',
      v_vote->>'observation'
    )
    on conflict (test_id, user_id, technique_id) do nothing;
  end loop;

  return jsonb_build_object('test_id', v_test_id, 'already_imported', false);
end;
$$;

-- Function ownership/grants are unaffected by create-or-replace, but
-- restated here for the same reason the original migration did: nothing
-- should ever rely on implicit default grants for a security-definer
-- function that bypasses RLS.
revoke all on function public.ingest_test(jsonb) from public;
revoke all on function public.ingest_test(jsonb) from anon;
revoke all on function public.ingest_test(jsonb) from authenticated;
grant execute on function public.ingest_test(jsonb) to service_role;
