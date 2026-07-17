---
name: audiophile-compare-build-history-70
description: Build step 70 — Fix track info missing for anonymous visitors (tracks table RLS gap).
---

# ✅ 70 — Fix: track info missing for anonymous visitors (`tracks` RLS gap)

**The bug:** track information (artist/title) failed to display on the
public feed (`app/page.tsx`) and test detail page
(`app/tests/[id]/page.tsx`) for anyone not signed in. First suspected as a
regression from step 69's `Promise.all` query parallelization (built the
same day), but the select query embedding `track:tracks(artist, title)` is
byte-identical before and after that change — ruled out directly.

**Root cause:** `supabase/migrations/20260625094142_initial_schema.sql`
(already applied — never edited) gives every other content table a
public-read policy:
```sql
create policy "tests: public read" on public.tests for select using (true);
create policy "clips: public read" on public.clips for select using (true);
-- systems, system_snapshots, users: same "using (true)" shape
```
but `tracks` alone requires authentication:
```sql
create policy "tracks: authenticated read"
  on public.tracks for select using (auth.uid() is not null);
```
Confirmed directly: querying `tracks` with the anon key returned `[]`;
with the service-role key, real rows. For an anonymous request, PostgREST
silently resolves a denied to-one embed as `null` rather than erroring —
so `track` was always `null` for an anonymous viewer, on both pages, which
both render `{track?.artist} — {track?.title}` unconditionally (no gating
on `user` — this was never an intentional redaction, unlike
`canSeeSystemInfo`'s snapshot/system gating). The "Allow anonymous users to
play clips, but require sign in to vote" commit opened up anonymous access
everywhere else in the app but missed this one policy — latent since the
very first migration. `/tracks` and `/tracks/[id]` are protected routes
(login required via `middleware.ts`), which is why this never surfaced
there; it only shows up on the two genuinely public routes, `/` and
`/tests/[id]`.

**The fix:** new migration (never edit the applied initial-schema one) —
`supabase/migrations/20260717120000_tracks_public_read.sql`:
```sql
drop policy "tracks: authenticated read" on public.tracks;

create policy "tracks: public read"
  on public.tracks for select using (true);
```
`"tracks: authenticated insert"` is untouched — creating tracks still
requires authentication; only the read gap is closed.

**Files updated:**
- `supabase/migrations/20260717120000_tracks_public_read.sql` (**new**).
- `supabase/migrations/__tests__/tracks-public-read.test.ts` (**new**, 2
  tests) — reads the raw SQL file and asserts on its text (same precedent
  as `deactivate-non-tune-method-techniques.test.ts`, since a unit test
  can't execute SQL against a real DB): drops the old policy and creates
  the new public-read one; doesn't touch the insert policy, table shape,
  or any other table's policies.
- `e2e/tests/public-feed.spec.ts` — two new assertions in the existing
  `Anonymous clip playback` describe block: track artist/title visible on
  the test detail page, and on a feed card, for an anonymous visitor.
- Docs: `audiophile-compare-schema.md` (RLS policy summary table — `tracks`
  Read column: `Authenticated` → `Public`), this file,
  `build-history/index.md`, `core.md` (§6 bump).

**Tests:**
- `supabase/migrations/__tests__/tracks-public-read.test.ts` (new, 2 tests,
  above).
- `e2e/tests/public-feed.spec.ts`'s two new assertions (above) — this is
  the coverage gap that let the bug ship unnoticed in the first place;
  every existing anonymous-playback test checked the player and vote-gating
  but never asserted on track text.

**Verified:**
- `npx tsc --noEmit` — no new errors.
- `npm test` — full suite green, including the new migration-content test.
- Applied to staging via `supabase db push`; confirmed via
  `supabase migration list` and by re-running the exact anon-key `curl`
  check used to diagnose the bug (`GET /rest/v1/tracks?select=...` now
  returns real rows instead of `[]`).
- Reloaded the live dev server's feed and a test detail page with no
  cookies (anonymous) — track artist/title now renders.
- `npx playwright test e2e/tests/public-feed.spec.ts` — full file passing,
  including the two new assertions.
- **Not yet applied to production** (`audiophile-prod`) — staging-only per
  this repo's standard rollout convention; a separate, explicit step.
