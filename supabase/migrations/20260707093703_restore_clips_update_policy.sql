-- The "clips: test creator update" policy from the initial schema migration
-- (20260625094142_initial_schema.sql) is present in that file but was found
-- missing from the live database during step 27 (confirmed via
-- `select * from pg_policies where tablename = 'clips'` — cause unknown,
-- pre-dates this step). Nothing before step 27 ever performed an UPDATE on
-- `clips` — verify doesn't touch the DB and test creation only INSERTs —
-- so the gap was silent until PATCH /api/clips/[id] (replacing a dead
-- clip's URL) became the first caller to actually need it. Recreating it
-- here, identical to the original.
create policy "clips: test creator update"
  on public.clips for update
  using (
    exists (
      select 1 from public.tests
      where id = test_id and creator_id = auth.uid()
    )
  );
