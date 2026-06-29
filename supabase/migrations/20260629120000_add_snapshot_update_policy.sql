-- Allow system owners to update their own snapshots.
-- Required for PATCH /api/systems/[id]/snapshots/[snapshotId] to succeed.
-- The INSERT policy already uses the same ownership join pattern.

create policy "snapshots: owner update"
  on public.system_snapshots for update
  using (
    exists (
      select 1 from public.systems
      where id = system_id and owner_id = auth.uid()
    )
  );
