-- Fixes a gap from the initial schema: every other content table (tests,
-- clips, systems, system_snapshots, users) allows public read; tracks was
-- left requiring auth.uid() is not null, silently nulling out the
-- track:tracks(...) embed on the public feed and test detail page for any
-- anonymous visitor since anonymous playback was introduced (see
-- "Allow anonymous users to play clips, but require sign in to vote").
drop policy "tracks: authenticated read" on public.tracks;

create policy "tracks: public read"
  on public.tracks for select using (true);
