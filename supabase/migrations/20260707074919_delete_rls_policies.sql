-- Step 26: add the missing DELETE policies needed to actually delete tests,
-- snapshots, clips, and clip_mapping rows.
--
-- `systems` already has a "for all" policy covering delete. The other
-- tables only had select/insert/update policies — without a delete policy,
-- RLS silently blocks both a direct DELETE and the ON DELETE CASCADE this
-- step's other migration relies on (cascaded deletes are still subject to
-- RLS for the acting role).

create policy "tests: creator delete"
  on public.tests for delete using (creator_id = auth.uid());

create policy "clips: test creator delete"
  on public.clips for delete
  using (
    exists (
      select 1 from public.tests
      where id = test_id and creator_id = auth.uid()
    )
  );

create policy "clip_mapping: test creator delete"
  on public.clip_mapping for delete
  using (
    exists (
      select 1 from public.tests
      where id = test_id and creator_id = auth.uid()
    )
  );

create policy "snapshots: owner delete"
  on public.system_snapshots for delete
  using (
    exists (
      select 1 from public.systems
      where id = system_id and owner_id = auth.uid()
    )
  );
