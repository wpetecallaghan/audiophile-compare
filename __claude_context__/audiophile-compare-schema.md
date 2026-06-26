# Schema Reference

Full database schema, RLS policies, and data model notes for the audiophile
comparison app. Read this file when writing queries, migrations, or RLS policies.

---

## Tables and columns

```sql
-- User profiles (mirrors auth.users; created by trigger on first login)
users (
  id           uuid PRIMARY KEY,       -- matches auth.users.id exactly
  email        text NOT NULL,
  display_name text,
  created_at   timestamptz DEFAULT now()
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
  CONSTRAINT tests_status_check CHECK (status IN ('open', 'revealed'))
)

-- One of the two media clips in a test
clips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     uuid NOT NULL REFERENCES tests(id),
  label       text NOT NULL,         -- 'A' or 'B' only
  source_url  text NOT NULL,
  provider    text NOT NULL,         -- 'youtube' | 'vimeo' | 'direct' | 'unknown'
  media_type  text NOT NULL,         -- 'audio' | 'video' | 'unknown'
  url_status  text NOT NULL DEFAULT 'ok',  -- 'ok' | 'degraded' | 'dead'
  duration_ms int,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT clips_label_check    CHECK (label IN ('A', 'B')),
  CONSTRAINT clips_provider_check CHECK (provider IN ('youtube', 'vimeo', 'direct', 'unknown')),
  CONSTRAINT clips_media_check    CHECK (media_type IN ('audio', 'video', 'unknown')),
  CONSTRAINT clips_status_check   CHECK (url_status IN ('ok', 'degraded', 'dead'))
)

-- SECURITY-CRITICAL: maps clip labels to before/after identity
-- Never returned to client until tests.status = 'revealed'
-- or tests.creator_id = auth.uid()
clip_mapping (
  test_id        uuid PRIMARY KEY REFERENCES tests(id),
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
```

---

## RLS policy summary

All tables have RLS enabled. Policy intent per table:

| Table | Read | Write |
|---|---|---|
| users | Public | Own row only |
| systems | Public | Owner only |
| system_snapshots | Public | System owner only (checked via JOIN) |
| tracks | Authenticated | Any authenticated user |
| tests | Public | Creator only (insert + update) |
| clips | Public | Test creator only (checked via JOIN) |
| clip_mapping | Revealed tests OR creator | Test creator only |
| listening_techniques | Public | Nobody (migration only) |
| votes | Own votes OR revealed test | Authenticated (own rows) |
| comments | Public | Authenticated (insert); owner (delete) |

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

### Fetch a test with its clips (no mapping)
```typescript
const { data } = await supabase
  .from('tests')
  .select(`
    id, title, status, created_at,
    creator:users!creator_id(display_name),
    track:tracks(artist, title, album, passage_note),
    clips(id, label, source_url, provider, media_type, url_status, embed_id)
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
