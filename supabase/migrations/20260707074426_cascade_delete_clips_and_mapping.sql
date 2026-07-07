-- Step 26: allow deleting tests, snapshots, and systems.
--
-- `clips` and `clip_mapping` rows are wholly owned by their test — created
-- together with it, never independently meaningful — so their deletion
-- should cascade when the test is deleted. `votes.test_id` deliberately
-- keeps its default (non-cascading) foreign key: the app layer already
-- refuses to delete a test with any votes, and this is a second,
-- database-enforced layer of that same protection.
--
-- `tests.snapshot_a_id`/`snapshot_b_id` and `system_snapshots.system_id`
-- keep their default (non-cascading) behavior unchanged — that's what
-- makes a snapshot/system undeletable while a test/snapshot still
-- references it.

alter table public.clips
  drop constraint clips_test_id_fkey,
  add constraint clips_test_id_fkey
    foreign key (test_id) references public.tests(id) on delete cascade;

alter table public.clip_mapping
  drop constraint clip_mapping_test_id_fkey,
  add constraint clip_mapping_test_id_fkey
    foreign key (test_id) references public.tests(id) on delete cascade;
