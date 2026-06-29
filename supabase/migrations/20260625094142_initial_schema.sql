-- ============================================================
-- TABLES
-- ============================================================

create table public.users (
  id           uuid primary key,
  email        text not null,
  display_name text,
  created_at   timestamptz default now()
);

create table public.systems (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.users(id),
  name        text not null,
  description text,
  created_at  timestamptz default now()
);

create table public.system_snapshots (
  id          uuid primary key default gen_random_uuid(),
  system_id   uuid not null references public.systems(id),
  version     int not null,
  label       text not null,
  notes       text,
  components  jsonb,
  created_at  timestamptz default now(),
  unique (system_id, version)
);

create table public.tracks (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid not null references public.users(id),
  artist        text not null,
  title         text not null,
  album         text,
  passage_note  text,
  created_at    timestamptz default now()
);

create table public.tests (
  id             uuid primary key default gen_random_uuid(),
  creator_id     uuid not null references public.users(id),
  track_id       uuid not null references public.tracks(id),
  snapshot_a_id  uuid not null references public.system_snapshots(id),
  snapshot_b_id  uuid not null references public.system_snapshots(id),
  title          text not null,
  status         text not null default 'open',
  revealed_at    timestamptz,
  created_at     timestamptz default now(),
  source_ref     text unique,  -- ingestion provenance; null for web-created tests
  constraint tests_status_check check (status in ('open', 'revealed'))
);

create table public.clips (
  id          uuid primary key default gen_random_uuid(),
  test_id     uuid not null references public.tests(id),
  label       text not null,
  source_url  text not null,
  provider    text not null,
  media_type  text not null,
  url_status  text not null default 'ok',
  duration_ms int,
  created_at  timestamptz default now(),
  constraint clips_label_check    check (label in ('A', 'B')),
  constraint clips_provider_check check (provider in ('youtube', 'vimeo', 'direct', 'unknown')),
  constraint clips_media_check    check (media_type in ('audio', 'video', 'unknown')),
  constraint clips_status_check   check (url_status in ('ok', 'degraded', 'dead'))
);

create table public.clip_mapping (
  test_id        uuid primary key references public.tests(id),
  before_clip_id uuid not null references public.clips(id),
  after_clip_id  uuid not null references public.clips(id)
);

create table public.listening_techniques (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text not null,
  sort_order  int not null default 0,
  is_other    boolean not null default false,
  is_active   boolean not null default true
);

create table public.votes (
  id                uuid primary key default gen_random_uuid(),
  test_id           uuid not null references public.tests(id),
  user_id           uuid not null references public.users(id),
  chosen_clip_id    uuid not null references public.clips(id),
  technique_id      uuid not null references public.listening_techniques(id),
  other_description text,
  observation       text,
  created_at        timestamptz default now(),
  unique (test_id, user_id, technique_id)
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  test_id    uuid not null references public.tests(id),
  user_id    uuid not null references public.users(id),
  body       text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- AUTO-CREATE USER PROFILE ON FIRST LOGIN
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users             enable row level security;
alter table public.systems           enable row level security;
alter table public.system_snapshots  enable row level security;
alter table public.tracks            enable row level security;
alter table public.tests             enable row level security;
alter table public.clips             enable row level security;
alter table public.clip_mapping      enable row level security;
alter table public.listening_techniques enable row level security;
alter table public.votes             enable row level security;
alter table public.comments          enable row level security;

create policy "users: public read"
  on public.users for select using (true);

create policy "users: insert own profile"
  on public.users for insert with check (id = auth.uid());

create policy "users: update own profile"
  on public.users for update using (id = auth.uid());

create policy "systems: owner full access"
  on public.systems for all using (owner_id = auth.uid());

create policy "systems: public read"
  on public.systems for select using (true);

create policy "snapshots: public read"
  on public.system_snapshots for select using (true);

create policy "snapshots: owner insert"
  on public.system_snapshots for insert
  with check (
    exists (
      select 1 from public.systems
      where id = system_id and owner_id = auth.uid()
    )
  );

create policy "snapshots: owner update"
  on public.system_snapshots for update
  using (
    exists (
      select 1 from public.systems
      where id = system_id and owner_id = auth.uid()
    )
  );

create policy "tracks: authenticated read"
  on public.tracks for select using (auth.uid() is not null);

create policy "tracks: authenticated insert"
  on public.tracks for insert with check (auth.uid() is not null);

create policy "tests: public read"
  on public.tests for select using (true);

create policy "tests: creator insert"
  on public.tests for insert with check (creator_id = auth.uid());

create policy "tests: creator update (reveal only)"
  on public.tests for update using (creator_id = auth.uid());

create policy "clips: public read"
  on public.clips for select using (true);

create policy "clips: test creator insert"
  on public.clips for insert
  with check (
    exists (
      select 1 from public.tests
      where id = test_id and creator_id = auth.uid()
    )
  );

create policy "clips: test creator update"
  on public.clips for update
  using (
    exists (
      select 1 from public.tests
      where id = test_id and creator_id = auth.uid()
    )
  );

create policy "clip_mapping: revealed or creator"
  on public.clip_mapping for select
  using (
    exists (
      select 1 from public.tests
      where id = test_id
        and (status = 'revealed' or creator_id = auth.uid())
    )
  );

create policy "clip_mapping: test creator insert"
  on public.clip_mapping for insert
  with check (
    exists (
      select 1 from public.tests
      where id = test_id and creator_id = auth.uid()
    )
  );

create policy "techniques: public read"
  on public.listening_techniques for select using (true);

create policy "votes: authenticated insert"
  on public.votes for insert with check (user_id = auth.uid());

create policy "votes: owner update"
  on public.votes for update using (user_id = auth.uid());

create policy "votes: read own or revealed"
  on public.votes for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tests
      where id = test_id and status = 'revealed'
    )
  );

create policy "comments: public read"
  on public.comments for select using (true);

create policy "comments: authenticated insert"
  on public.comments for insert with check (user_id = auth.uid());

create policy "comments: owner delete"
  on public.comments for delete using (user_id = auth.uid());

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Public vote count — security definer so it can count across the RLS
-- boundary without exposing individual votes or clip choices.
-- Safe to call for any viewer including logged-out visitors.
create or replace function public.test_vote_count(test_id uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(distinct user_id)
  from public.votes
  where votes.test_id = $1
$$;

-- ============================================================
-- SEED DATA
-- ============================================================

insert into public.listening_techniques (name, description, sort_order, is_other, is_active) values
  ('Tune Method',               'Assesses rhythmic coherence, pace, and timing — whether the music flows naturally', 1, false, true),
  ('PRaT',                      'Pace, Rhythm and Timing — focuses on drive and rhythmic momentum',                  2, false, true),
  ('Tonal / Frequency balance', 'Assesses bass weight, midrange presence, treble extension and tonal naturalness',   3, false, true),
  ('Soundstage & imaging',      'Width, depth, and specificity of instrument placement',                             4, false, true),
  ('General preference',        'No specific methodology — overall impression',                                      5, false, true),
  ('Other',                     'A different approach not listed above — please describe it',                        6, true,  true);