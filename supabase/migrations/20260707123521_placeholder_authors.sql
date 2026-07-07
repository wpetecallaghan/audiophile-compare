-- Step 30 (forum ingestion pipeline): placeholder author infrastructure.
-- See build-history-ingestion.md for the full design/rationale.

-- Marks a public.users row as a placeholder identity (e.g. an imported
-- forum author who hasn't joined the app yet) rather than a real signup.
-- No RLS policy needed for this column: it's only ever set by the ingest
-- route's admin/service-role client, which bypasses RLS entirely (same as
-- the step-10 cron).
alter table public.users
  add column is_placeholder boolean not null default false;

-- Maps an external identity (e.g. a Lejonklou forum username) to the
-- placeholder public.users row created for them. Keyed on the raw,
-- unmodified external_username rather than a derived/slugified email,
-- since slugification is lossy and collision-order-dependent — see
-- build-history-ingestion.md step 30, decision 6.
create table public.import_authors (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null,
  external_username  text not null,
  user_id            uuid not null references public.users(id) on delete cascade,
  created_at         timestamptz default now(),
  unique (source, external_username)
);

alter table public.import_authors enable row level security;

-- Public read so the UI can show provenance (e.g. "imported from the
-- Lejonklou forum") — deliberate choice, see build-history-ingestion.md.
-- No insert/update/delete policy — only ever written via the
-- admin/service-role client (ingest route, future merge step).
create policy "import_authors: public read"
  on public.import_authors for select using (true);
