---
name: audiophile-compare-schema
description: >
  Complete database schema, RLS policies, auth triggers, and common query patterns
  for the audiophile A/B comparison app. Load when writing queries, migrations, or
  RLS policies, or for any task touching the data model.
---

# Schema Reference

Full database schema, RLS policies, and data model notes for the audiophile
comparison app. Read this file when writing queries, migrations, or RLS policies.

---

## Tables and columns

```sql
-- User profiles (mirrors auth.users; created by trigger on first login)
users (
  id             uuid PRIMARY KEY,       -- matches auth.users.id exactly
  email          text NOT NULL,
  display_name   text,
  created_at     timestamptz DEFAULT now(),
  is_placeholder boolean NOT NULL DEFAULT false  -- step 30: true for imported/unclaimed identities (e.g. forum authors)
)

-- Maps an external identity (e.g. a Lejonklou forum username) to the
-- placeholder `users` row created for them at import time. Keyed on the
-- raw, unmodified external_username — not a derived/slugified email —
-- since slugification is lossy and collision-order-dependent. Repointed
-- (not deleted) when a real user eventually claims their content.
import_authors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL,               -- e.g. 'lejonklou-forum'
  external_username text NOT NULL,               -- raw forum username
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (source, external_username)
)

-- A physical audio system owned by a user
systems (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users(id),
  name        text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now()
)

-- Point-in-time configuration snapshot (append-only — never modified after insert)
system_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id   uuid NOT NULL REFERENCES systems(id),
  version     int NOT NULL,
  label       text NOT NULL,
  notes       text,
  components  jsonb,    -- [{role, make, model, notes}, ...]
  created_at  timestamptz DEFAULT now(),
  UNIQUE (system_id, version)
)

-- Musical passage used as a test reference (shared across all users)
tracks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    uuid NOT NULL REFERENCES users(id),
  artist        text NOT NULL,
  title         text NOT NULL,
  album         text,
  passage_note  text,
  created_at    timestamptz DEFAULT now()
)

-- A blind A/B comparison between two system snapshots on one track
tests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id     uuid NOT NULL REFERENCES users(id),
  track_id       uuid NOT NULL REFERENCES tracks(id),
  snapshot_a_id  uuid NOT NULL REFERENCES system_snapshots(id),
  snapshot_b_id  uuid NOT NULL REFERENCES system_snapshots(id),
  title          text NOT NULL,
  status         text NOT NULL DEFAULT 'open',   -- 'open' | 'revealed'
  revealed_at    timestamptz,
  created_at     timestamptz DEFAULT now(),
  source_ref     text UNIQUE,   -- ingestion provenance e.g. 'lejonklou-forum:thread-42:post-187'
                                -- NULL for tests created via the web UI
  source_url     text,          -- the real forum post URL, for the UI's "view
                                -- original post" link (step 32) — NULL for
                                -- web-UI-created tests and for imports that
                                -- predate this column
  CONSTRAINT tests_status_check CHECK (status IN ('open', 'revealed'))
)

-- One of the two media clips in a test
clips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     uuid NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  label       text NOT NULL,         -- 'A' or 'B' only
  source_url  text NOT NULL,
  provider    text NOT NULL,         -- 'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'
  media_type  text NOT NULL,         -- 'audio' | 'video' | 'unknown'
  url_status  text NOT NULL DEFAULT 'ok',  -- 'ok' | 'degraded' | 'dead'
  duration_ms int,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT clips_label_check    CHECK (label IN ('A', 'B')),
  CONSTRAINT clips_provider_check CHECK (provider IN ('youtube', 'vimeo', 'google-drive', 'direct', 'unknown')),
  CONSTRAINT clips_media_check    CHECK (media_type IN ('audio', 'video', 'unknown')),
  CONSTRAINT clips_status_check   CHECK (url_status IN ('ok', 'degraded', 'dead'))
)

-- SECURITY-CRITICAL: maps clip labels to before/after identity
-- Never returned to client until tests.status = 'revealed'
-- or tests.creator_id = auth.uid()
clip_mapping (
  test_id        uuid PRIMARY KEY REFERENCES tests(id) ON DELETE CASCADE,
  before_clip_id uuid NOT NULL REFERENCES clips(id),
  after_clip_id  uuid NOT NULL REFERENCES clips(id)
)

-- Curated listening techniques (seeded at deploy; admin-managed only via migration)
listening_techniques (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  is_other    boolean NOT NULL DEFAULT false,  -- true for 'Other' row only
  is_active   boolean NOT NULL DEFAULT true
)

-- Seed data (already applied):
-- Tune Method (sort 1), PRaT (2), Tonal / Frequency balance (3),
-- Soundstage & imaging (4), General preference (5), Other (6, is_other=true)

-- One vote per user per technique per test
votes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id           uuid NOT NULL REFERENCES tests(id),
  user_id           uuid NOT NULL REFERENCES users(id),
  chosen_clip_id    uuid NOT NULL REFERENCES clips(id),
  technique_id      uuid NOT NULL REFERENCES listening_techniques(id),
  other_description text,    -- required when technique.is_other = true
  observation       text,    -- optional: what did the listener notice?
  created_at        timestamptz DEFAULT now(),
  UNIQUE (test_id, user_id, technique_id)
)

-- Comments on a test
comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id    uuid NOT NULL REFERENCES tests(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  body       text NOT NULL,
  created_at timestamptz DEFAULT now()
)

-- API keys for programmatic / agentic access (added when agentic API is implemented)
-- key_hash stores a bcrypt hash — plaintext key shown to user once and never stored
-- DECISION: api_keys table is NOT needed. The only non-browser callers are:
--   (1) the forum ingestion pipeline — authenticated as a dedicated ingestion_bot user
--   (2) the mobile app — authenticated as the end user via Supabase Auth
-- No general-purpose API key infrastructure is planned.
-- See api-conventions.md §5 — Programmatic access.

-- FUTURE (not yet implemented): owned blob storage for recordings
-- When added, clips.provider gains 'supabase' and 'r2' as valid values,
-- and a storage_key column is added for the internal object path:
--
-- ALTER TABLE public.clips
--   DROP CONSTRAINT clips_provider_check,
--   ADD CONSTRAINT clips_provider_check
--     CHECK (provider IN ('youtube', 'vimeo', 'direct', 'unknown', 'supabase', 'r2'));
--
-- ALTER TABLE public.clips ADD COLUMN storage_key text;
--
-- See deferred-features.md "Owned blob storage" and docs/audiophile-compare-app-specification.md for storage expansion rationale.
```

---

## RLS policy summary

All tables have RLS enabled. Policy intent per table:

| Table | Read | Write |
|---|---|---|
| users | Public | Own row only |
| systems | Public | Owner only (insert + update + delete) |
| system_snapshots | Public | System owner only, checked via JOIN (insert + update + delete) |
| tracks | Authenticated | Any authenticated user |
| tests | Public | Creator only (insert + update + delete) |
| clips | Public | Test creator only, checked via JOIN (insert + update + delete) |
| clip_mapping | Revealed tests OR creator | Test creator only, checked via JOIN (insert + delete) |
| listening_techniques | Public | Nobody (migration only) |
| votes | Own votes OR revealed test | Authenticated (own rows) |
| comments | Public | Authenticated (insert); owner (delete) |
| import_authors | Public | Nobody (admin/service-role client only — ingest route and future merge step) |

**Note on forum ingestion:** the pipeline does not run as a single shared
bot user — each forum post author, and separately each voter/commenter,
resolves or creates its own placeholder identity (see "Placeholder authors"
below). Writes happen through the `ingest_test` Postgres function via the
admin/service-role client, which bypasses RLS entirely — there is no
per-request session to check RLS against. The `source_ref` column on
`tests` (UNIQUE, nullable) records forum provenance for idempotency — see
`api-conventions.md §5` (Programmatic access) and `ingest_test` below.

### clip_mapping policy (most important)
```sql
-- Read: only when test is revealed OR you are the creator
CREATE POLICY "clip_mapping: revealed or creator"
  ON public.clip_mapping FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tests
      WHERE id = test_id
        AND (status = 'revealed' OR creator_id = auth.uid())
    )
  );
```

### Delete rules (step 26)

A creator can delete a **test** only if it has zero votes — once a vote
exists the test is frozen forever, no delete or edit. A creator can delete
a **snapshot** only if no test references it; an owner can delete a
**system** only if it has no snapshots. All three are hard deletes (no
`deleted_at` column), enforced at two layers:

- **App layer:** each `DELETE` route checks the relevant condition itself
  and returns 409 with a friendly message if it doesn't hold.
- **Database layer, as a backstop:** `clips.test_id` and
  `clip_mapping.test_id` cascade (`ON DELETE CASCADE`) since those rows are
  wholly owned by their test. `tests.snapshot_a_id`/`snapshot_b_id` and
  `system_snapshots.system_id` keep their default (non-cascading, `RESTRICT`-
  like) foreign keys — that's what makes a referenced snapshot/system
  physically undeletable regardless of the app-layer check.
  `votes.test_id` also keeps its default foreign key, so even a buggy
  app-layer check can't delete a test a vote references.

### Clip health rules (step 27)

`clips.url_status` (`ok`/`degraded`/`dead`, written daily by the step 10
cron) is surfaced instead of silently ignored: a `dead` clip blocks voting
(`POST /api/votes` re-checks server-side; the UI hides the vote form) and
gets a "Broken" badge everywhere a test's status is shown as a list item.
The creator can replace a dead clip's URL via `PATCH /api/clips/[id]`, but
only while the test has zero votes — the same "frozen forever after a
vote" rule as deleting a test (step 26).

**`clips` was missing its UPDATE policy on the live database** — present
in the initial schema migration file, absent from `pg_policies` when
actually queried, for reasons that predate this step and were never
diagnosed (nothing before step 27 ever ran `UPDATE` on `clips`, so the gap
was silent). Recreated via
`20260707093703_restore_clips_update_policy.sql`. `PATCH /api/clips/[id]`
also now defends against this class of bug directly: it chains
`.select().single()` after the update and treats a missing row as failure,
rather than trusting an absent `error` to mean a row actually changed (see
`api-conventions.md` Rule 5).

### Google Drive clip provider (step 34)

`google-drive` added to `clips.provider` alongside the original four
values (`20260707191616_clips_google_drive_provider.sql`). Drive share
links (`drive.google.com/file/d/{id}/...`) have a stable, confirmed
embeddable form (`/file/d/{id}/preview` — verified directly: `200`, no
`X-Frame-Options`/`frame-ancestors` blocking third-party embedding) and
get the exact same treatment YouTube/Vimeo already do: no health
verification (an unreachable embed just shows its own broken state
in-iframe), never touched by the step 10 cron (which only checks
`provider = 'direct'`). **Google Photos and iCloud shared links remain
`unknown` by design, not as a remaining gap** — neither has an equivalent
public, stable, embeddable URL for third-party use. See `components.md`
§5 for the one real limitation: Drive's embed has no control SDK, so
`GoogleDrivePlayer`'s `pause()` is a documented no-op.

### Placeholder authors (step 30)

Forum-ingested content (see `build-history-ingestion.md`) is attributed to
a real, full `users` row per external author — not a single shared bot
user, and not a nullable-owner schema — so ownership works identically to
any real account everywhere in the app. `is_placeholder = true` marks these
rows; `import_authors` maps the raw external identity
(`source` + `external_username`) to the placeholder's `user_id`, keyed on
the unmodified username rather than a derived email (slugification is
lossy and its collision-suffixing is order-dependent, so a raw username
can't be reliably resolved back from an email alone). `lib/ingestion/
create-placeholder-author.ts` is the only writer of either — via the
admin/service-role client, which is also why neither needs a write RLS
policy (see the table above). When a real person eventually claims their
imported content, the expected merge repoints `import_authors.user_id`
(preserving the "this account is forum-user X" fact) rather than deleting
the row — planned as `build-history-ingestion.md` step 39 (claim flow),
not yet built.

### ingest_test function (step 31)

A `security definer` Postgres function (`public.ingest_test(payload jsonb)
returns jsonb`) that atomically resolves/creates a track, two systems, two
snapshots, and a test with its clips/clip_mapping/votes — one call per
forum post. Called via `.rpc('ingest_test', { payload })` from
`app/api/internal/ingest/route.ts`. Idempotent on `payload.source_ref`
(returns the existing test id with `already_imported: true` on a repeat
call). Placeholder author resolution happens in application code *before*
this function runs (`auth.admin.createUser()` can't run inside SQL) and is
separately idempotent, so a partial failure here is self-healing on retry.
Extended in step 32 (`20260707173905_tests_source_url.sql`, layered on top
of the original migration, not an edit to it) to also accept and store
`payload.source_url` onto the new `tests.source_url` column.

**Security-critical:** because it's `security definer` and bypasses RLS,
its migration explicitly revokes EXECUTE from `public`/`anon`/
`authenticated` and grants it only to `service_role` — Supabase grants
EXECUTE on new functions to `anon`/`authenticated` by default, which would
otherwise let anyone with the anon key call
`POST /rest/v1/rpc/ingest_test` directly, bypassing both RLS and the
ingest route's `INGEST_SECRET` check. Verified directly against staging
with the anon key: calling the RPC returns `401`,
`"permission denied for function ingest_test"`.

### test_vote_count function (public vote count)

A `security definer` Postgres function that returns the number of distinct
listeners who have voted on a test, bypassing RLS safely. It exposes only
an aggregate — never individual votes or clip choices — so it is safe to
call for any viewer including logged-out visitors.

Add this as a migration (`supabase migration new add_vote_count_function`):

```sql
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
```

Called from application code via:
```typescript
const { data } = await supabase
  .rpc('test_vote_count', { test_id: testId })

const voteCount: number = data ?? 0
```

Never query the `votes` table directly for a public count — the RLS policy
restricts vote rows to own votes or revealed tests, so a direct count would
return 0 or an error for most callers.

---

### Auth triggers (in initial_schema.sql)

Two `security definer` triggers on `auth.users` keep `public.users` in sync:

**`on_auth_user_created`** — fires on `INSERT` (every new sign-up or OAuth login).
Inserts a row into `public.users`, deriving `display_name` from user metadata:
```sql
coalesce(
  raw_user_meta_data->>'full_name',  -- set by signUp({ options: { data: { full_name } } })
  raw_user_meta_data->>'name',       -- some OAuth providers
  split_part(email, '@', 1)          -- magic link / password fallback
)
```
Uses `ON CONFLICT (id) DO NOTHING` so re-triggering is safe.

**`on_auth_user_email_updated`** — fires on `UPDATE OF email` when the value
actually changes. Updates `public.users.email` to match. Supabase only writes
the new email to `auth.users` after both confirmation emails are clicked, so
this is the correct place to sync the change.

---

## Key data model notes

### system_snapshots are append-only
Never UPDATE a snapshot after insert. If a system changes, INSERT a new
snapshot with `version = previous_version + 1`. Old clips always reference
valid historical snapshots.

### components JSONB structure
```json
[
  { "role": "Source", "make": "Rega", "model": "Planar 3", "notes": "" },
  { "role": "Amplifier", "make": "Naim", "model": "Nait 5si", "notes": "" },
  { "role": "Speakers", "make": "ProAc", "model": "Tablette 10", "notes": "" }
]
```
No enforced schema in v1 — normalise later if needed.

### listening_techniques governance
The `Other` row (`is_other = true`) is the only free-text technique.
Votes with `technique.is_other = true` must have `other_description` populated.
The `Other` technique is excluded from cross-test analytics — it is qualitative
only, displayed as a list of descriptions rather than a percentage bar.

### Cross-check tests
A cross-check test reuses `source_url` values from existing clips on different
tests. No new recordings needed. The creator selects two snapshots and two
existing clip URLs; the system creates a new test + clip rows pointing to the
same URLs. The `clip_mapping` table still gets a new row for the new test.

### Tracks are shared
Any authenticated user can create a track. Tracks are not owned — they belong
to the shared catalogue. When creating a test, the creator searches existing
tracks first and creates a new one only if the recording isn't already listed.

---

## Common query patterns

### Public vote count (safe for all viewers including logged-out)
```typescript
// Always use the RPC function — never query votes directly for a public count
const { data } = await supabase
  .rpc('test_vote_count', { test_id: testId })

const voteCount: number = data ?? 0
```

### Fetch a test with its clips (no mapping)
```typescript
const { data } = await supabase
  .from('tests')
  .select(`
    id, title, status, created_at,
    creator:users!creator_id(display_name),
    track:tracks(artist, title, album, passage_note),
    clips(id, label, source_url, provider, media_type, url_status)
  `)
  .eq('id', testId)
  .single()
```

### Fetch clip_mapping (only when allowed)
```typescript
// Only call this after verifying status === 'revealed' || creator check
const { data } = await supabase
  .from('clip_mapping')
  .select('before_clip_id, after_clip_id')
  .eq('test_id', testId)
  .single()
```

### Vote tally by technique
```typescript
const { data } = await supabase
  .from('votes')
  .select(`
    chosen_clip_id,
    technique:listening_techniques(name, is_other)
  `)
  .eq('test_id', testId)
// Group and count in application code — Supabase JS client
// does not support GROUP BY directly; use a Postgres function
// or process the array if the vote count is small.
```

### User's vote status on a test
```typescript
const { count } = await supabase
  .from('votes')
  .select('*', { count: 'exact', head: true })
  .eq('test_id', testId)
  .eq('user_id', user.id)

const hasVoted = (count ?? 0) > 0
```
