# Audiophile Comparison App — Full Architecture Specification

> This document is a complete specification of the application architecture, data model, and design decisions made during the planning phase. It is intended to be handed directly to an AI coding assistant (e.g. Claude Code) to begin building the application.

---

## 1. Application Overview

A web application for audiophile and hi-fi enthusiasts to share, compare, and collaboratively evaluate recordings of audio systems under test. Users record "before" and "after" clips of music playing through their system — capturing the effect of a change such as cable replacement, component repositioning, or isolation treatment — and invite peers to vote on a blind A/B comparison.

### Core value propositions
- Blind A/B listening tests with structured voting by listening technique
- System snapshot history to enable cross-time comparison and avoid local-maxima traps
- Track catalogue to link recordings across sessions and configurations
- Community evaluation with technique-level result breakdown

---

## 2. User Personas

| Persona | Role | Primary goal |
|---|---|---|
| Test creator | Registered user | Upload clips, define system snapshots, run blind tests |
| Peer listener | Registered user | Listen, vote by technique, comment |
| Visitor | Anonymous | Browse tests and results; may register to participate |

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server components keep before/after mapping server-side only; never exposed to client |
| Hosting | Vercel | Zero-config Next.js deployment; serverless functions for API routes |
| Database | Supabase (Postgres) | RLS policies, auth, real-time — one platform |
| Auth | Supabase Auth | Magic link + OAuth; no hand-rolled auth |
| File storage | None (BYOS — see §5) | Users supply their own storage URLs |
| Styling | Tailwind CSS | Mobile-first, rapid iteration |
| Media playback | Native `<audio>` / `<video>` + iframe for YouTube/Vimeo | No additional library needed for v1 |
| Background jobs | Vercel Cron | Periodic URL health checks |

---

## 4. User Stories — v1 Scope

### Creator
- Upload two clip URLs and title the comparison so peers can listen and vote blind
- Describe the system under test (snapshot label, component notes, free text)
- Choose which existing system snapshot each clip represents
- Reveal the before/after identity of clips when ready; votes are preserved
- View results broken down by listening technique after reveal

### Listener (registered)
- Play both clips (A and B) without knowing which is before/after
- Select a listening technique and cast a vote
- Optionally add an observation note describing what they heard
- Vote again with a different technique on the same test
- See aggregate results (per technique) only after voting or after reveal

### Visitor (anonymous)
- Browse the public feed of tests: title, system description, vote count, status
- Cannot play clips or vote without registering

### Out of scope for v1
- Component catalogue (structured make/model database)
- Groups and private tests
- Notifications and follows
- Timestamped clip comments
- Native mobile app
- Technique nomination / promotion workflow (Tier 3)
- Monetisation

---

## 5. Media & Storage Model (BYOS)

The application does **not** manage file storage. Users supply URLs to media they have already uploaded to their own storage. The app stores the URL and validates it at submission time.

### Supported providers

| Provider | Media type | Playback method | Notes |
|---|---|---|---|
| YouTube (unlisted) | Video | `<iframe>` embed | Recommended for video; no CORS issues |
| Vimeo | Video | `<iframe>` embed | Privacy controls available |
| Google Photos | Video | Link embed | Viable for video; not for audio |
| Dropbox | Audio or video | Native `<audio>` / `<video>` | Change `dl=0` to `dl=1` in URL |
| Direct URL | Audio or video | Native `<audio>` / `<video>` | Any public `.mp3`, `.m4a`, `.mp4`, `.mov` etc. |
| iCloud / OneDrive | — | — | Not reliably embeddable; steer users away |

### URL submission flow
1. User pastes a URL into the clip field (no file picker)
2. Server detects provider from URL pattern (youtube.com → `youtube`; vimeo.com → `vimeo`; else → `direct`)
3. For `direct` URLs: server performs a HEAD request to confirm it resolves and reads `Content-Type` to set `media_type`
4. For `youtube` / `vimeo`: `media_type` is assumed `video`
5. URL, provider, and media_type are stored; `MediaPlayer` renders the correct element at display time

### MediaPlayer component — rendering logic
- `provider = youtube` → `<iframe src="https://www.youtube.com/embed/{id}">`
- `provider = vimeo` → `<iframe src="https://player.vimeo.com/video/{id}">`
- `media_type = audio` → `<audio controls src={source_url}>`
- `media_type = video` → `<video controls src={source_url}>`
- Unknown → plain link with a warning

**Note:** iframe providers (YouTube, Vimeo) require their respective JS APIs for play/pause synchronisation between Clip A and Clip B. Native `<audio>` and `<video>` elements share the same JS API and can be controlled directly. Pausing Clip A when Clip B starts playing must be implemented for all provider types.

### Video and blind test integrity
Video is treated as the default recording format — most users record on mobile phones and video is the path of least resistance. No audio extraction or video hiding is applied by default. Creators typically frame recordings away from the equipment, so visual bias is low in practice. A simple label ("video test") is shown to voters when clips are video. The `playback_mode` concept was considered and rejected in favour of this simpler approach.

---

## 6. Complete Database Schema

### `users`
Managed by Supabase Auth. A profile record is created on first login.

```sql
users (
  id           uuid PRIMARY KEY,  -- matches Supabase auth.users.id
  email        text NOT NULL,
  display_name text,
  created_at   timestamptz DEFAULT now()
)
```

### `systems`
A physical audio system owned by a user.

```sql
systems (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES users(id),
  name        text NOT NULL,       -- e.g. "Main listening room"
  description text,
  created_at  timestamptz DEFAULT now()
)
```

### `system_snapshots`
A point-in-time configuration of a system. Append-only — never modified after creation. Think of these as git commits for a physical system.

```sql
system_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id   uuid NOT NULL REFERENCES systems(id),
  version     int NOT NULL,        -- auto-incrementing per system
  label       text NOT NULL,       -- e.g. "Cone B on shelf 2"
  notes       text,                -- what changed and why
  components  jsonb,               -- [{role, make, model, notes}, ...]
  created_at  timestamptz DEFAULT now(),
  UNIQUE (system_id, version)
)
```

**`components` JSONB structure:**
```json
[
  { "role": "isolation", "make": "Herbie's", "model": "Cone B", "notes": "under amp, shelf 2" },
  { "role": "amplifier", "make": "Naim", "model": "NAP 250", "notes": "" }
]
```
Using JSONB keeps the schema simple in v1. No normalised components table is needed. Structure can be formalised in v2 based on community usage patterns.

### `tracks`
A musical passage used as a test reference. Shared across users — if two users test with the same piece, they reference the same track record.

```sql
tracks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    uuid NOT NULL REFERENCES users(id),
  artist        text NOT NULL,
  title         text NOT NULL,
  album         text,
  passage_note  text,   -- e.g. "opening 30 seconds", "piano solo at 2:10"
  created_at    timestamptz DEFAULT now()
)
```

### `tests`
A blind A/B comparison between two system snapshots using a specific track.

```sql
tests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id     uuid NOT NULL REFERENCES users(id),
  track_id       uuid NOT NULL REFERENCES tracks(id),
  snapshot_a_id  uuid NOT NULL REFERENCES system_snapshots(id),
  snapshot_b_id  uuid NOT NULL REFERENCES system_snapshots(id),
  title          text NOT NULL,
  status         text NOT NULL DEFAULT 'open',  -- 'open' | 'revealed'
  revealed_at    timestamptz,
  created_at     timestamptz DEFAULT now()
)
```

### `clips`
One of the two media clips in a test (labelled A or B — never "before" or "after" until reveal).

```sql
clips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     uuid NOT NULL REFERENCES tests(id),
  label       text NOT NULL,    -- 'A' or 'B'
  source_url  text NOT NULL,    -- URL supplied by the creator
  provider    text NOT NULL,    -- 'youtube' | 'vimeo' | 'direct' | 'unknown'
  media_type  text NOT NULL,    -- 'audio' | 'video' | 'unknown'
  url_status  text NOT NULL DEFAULT 'ok',  -- 'ok' | 'degraded' | 'dead'
  duration_ms int,              -- populated at URL verification if available
  created_at  timestamptz DEFAULT now()
)
```

### `clip_mapping`
**Security-critical table.** Stores which clip is "before" and which is "after". Separate from `clips` so RLS can restrict access completely until reveal. This table must **never** be joined into a client-facing response until `tests.status = 'revealed'` AND the requester is the test creator.

```sql
clip_mapping (
  test_id       uuid PRIMARY KEY REFERENCES tests(id),
  before_clip_id uuid NOT NULL REFERENCES clips(id),
  after_clip_id  uuid NOT NULL REFERENCES clips(id)
)
```

**RLS policy:** Readable only when `tests.revealed_at IS NOT NULL` OR `tests.creator_id = auth.uid()`.

### `listening_techniques`
Curated list of listening methodologies. Seeded at deployment. Admin-managed only in v1.

```sql
listening_techniques (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,    -- "Tune Method", "PRaT", "Other", etc.
  description text NOT NULL,           -- shown to voter before selection
  sort_order  int NOT NULL DEFAULT 0,  -- controls display sequence
  is_other    boolean NOT NULL DEFAULT false,  -- true for the single "Other" row only
  is_active   boolean NOT NULL DEFAULT true    -- false = hidden from selector; votes preserved
)
```

**Seed data:**
| name | description | is_other |
|---|---|---|
| Tune Method | Assesses rhythmic coherence, pace, and timing — whether the music flows naturally | false |
| PRaT | Pace, Rhythm and Timing — focuses on drive and rhythmic momentum | false |
| Tonal / Frequency balance | Assesses bass weight, midrange presence, treble extension and overall tonal naturalness | false |
| Soundstage & imaging | Width, depth, and specificity of instrument placement | false |
| General preference | No specific methodology — overall impression | false |
| Other | A different approach not listed above — please describe it | true |

### `votes`
One vote per user per technique per test. Multiple techniques per listener are permitted and encouraged.

```sql
votes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id           uuid NOT NULL REFERENCES tests(id),
  user_id           uuid NOT NULL REFERENCES users(id),
  chosen_clip_id    uuid NOT NULL REFERENCES clips(id),
  technique_id      uuid NOT NULL REFERENCES listening_techniques(id),
  other_description text,    -- required when technique.is_other = true; null otherwise
  observation       text,    -- optional: what did the listener notice?
  created_at        timestamptz DEFAULT now(),
  UNIQUE (test_id, user_id, technique_id)
)
```

### `comments`
Freeform discussion on a test. Visible to all after reveal; creator may choose to allow comments before reveal.

```sql
comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id    uuid NOT NULL REFERENCES tests(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  body       text NOT NULL,
  created_at timestamptz DEFAULT now()
)
```

---

## 7. Key Security Rules

### Before/after identity
- `clip_mapping` is never returned to the client until `tests.status = 'revealed'`
- The reveal API endpoint is gated: only `tests.creator_id = auth.uid()` may call it
- Server components handle all queries that involve `clip_mapping`; this logic must never move to a client component

### Vote tally visibility
- The vote tally for a test is not returned to a client until either:
  - The requesting user has already cast at least one vote on that test, OR
  - `tests.status = 'revealed'`
- This rule is enforced server-side (API route / server component), not in the UI

### Audio/video access
- Clips are stored as user-supplied public URLs; access control is the user's responsibility at the provider level
- The app does not proxy audio or video in v1 (exception: CORS fallback for direct URLs if needed)

### Auth requirements
- Viewing the test feed and test detail pages: public (no login required)
- Playing clips: requires login
- Voting, commenting: requires login
- Revealing a test, creating a test, managing snapshots: requires login + ownership check

---

## 8. API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/tests` | Public | Paginated test feed |
| POST | `/api/tests` | Required | Create a new test |
| GET | `/api/tests/[id]` | Public | Test detail (no clip_mapping) |
| POST | `/api/tests/[id]/reveal` | Creator only | Reveal before/after identity |
| GET | `/api/tests/[id]/results` | Post-vote or revealed | Vote tallies by technique |
| POST | `/api/votes` | Required | Cast a vote |
| PUT | `/api/votes/[id]` | Owner only | Update vote (before reveal) |
| POST | `/api/clips/verify` | Required | Validate a clip URL (HEAD request + provider detection) |
| GET | `/api/systems` | Required | List creator's systems |
| POST | `/api/systems` | Required | Create a system |
| POST | `/api/systems/[id]/snapshots` | Required | Create a new snapshot |
| GET | `/api/tracks` | Required | Search/list tracks |
| POST | `/api/tracks` | Required | Create a track |
| GET | `/api/techniques` | Public | List active listening techniques |

---

## 9. System Catalogue & Track Navigation

Three navigation views must be implemented to support cross-time comparison:

### View 1 — By track
"Show me all tests that used this passage."
- User selects a track; app returns all tests referencing it, ordered by date
- Displays which snapshots were compared in each test
- Enables "go back in time" — seeing the full history of how a track sounded across configurations

### View 2 — By snapshot
"Show me everything tested at this system configuration."
- User selects a snapshot; app returns all tests where it appeared as either side A or side B
- Shows win/loss record for that snapshot

### View 3 — Cross-check (anti-local-maxima feature)
"Compare any two snapshots directly."
- User selects Snapshot A and Snapshot B (regardless of when created)
- App finds tracks that appear in tests for both snapshots
- If matching clips exist, a new test can be created from existing clip URLs — no new recording needed
- This directly addresses the risk of successive "locally good" decisions leading to a globally suboptimal configuration

---

## 10. Listening Technique Governance

### Three tiers

| Tier | Name | Behaviour |
|---|---|---|
| 1 | Curated | Named techniques seeded at launch. Stable IDs. Results are cross-test comparable. Admin-managed only. |
| 2 | Other | Single row (`is_other = true`). Requires free-text description. Excluded from technique-level aggregation. Shown as qualitative list in results. |
| 3 | Proposed | Deferred to v2. Recurrent "Other" descriptions may be nominated for promotion to Tier 1. |

### Results display logic
- Curated techniques (`is_other = false`): shown as percentage bars, grouped by technique, with vote count
- Other votes: shown as a separate qualitative section — each voter's description and preference listed individually
- Divergence detection: when curated techniques disagree on winner, surface a note: "Timing-focused listeners preferred B; tonal listeners preferred A — this change may involve a tradeoff."

---

## 11. Background Jobs

### URL health check (Vercel Cron)
- Runs daily
- HEAD-pings `source_url` for all clips in tests with `status = 'open'`
- Updates `clips.url_status` to `degraded` (non-200 but reachable) or `dead` (unreachable)
- If any clip in a test is `dead`, notify the test creator (in-app notification in v1; email in v2)

---

## 12. Page Structure

| Page | Route | Auth | Description |
|---|---|---|---|
| Home / feed | `/` | Public | Paginated list of tests with status, vote count, track info |
| Test detail | `/tests/[id]` | Public (play requires login) | Clip player, voting UI, results (gated), comments |
| Create test | `/tests/new` | Required | Multi-step: select track → select/create snapshots → paste clip URLs → publish |
| My systems | `/systems` | Required | List systems and their snapshot history |
| System detail | `/systems/[id]` | Required | Snapshot timeline, cross-check launcher |
| Track catalogue | `/tracks` | Required | Search and browse tracks; link to tests using each |
| Profile | `/profile` | Required | Display name, voting history |

---

## 13. Build Order (Recommended)

Build in this sequence to validate the hardest parts first:

1. **Supabase project setup** — schema migration, RLS policies, seed data (techniques)
2. **Auth** — Supabase Auth with Next.js middleware; protected routes
3. **Clip URL verification** — `/api/clips/verify`; provider detection; HEAD request validation
4. **MediaPlayer component** — handles all four rendering cases (YouTube, Vimeo, audio, video)
5. **Test creation flow** — track selection/creation, snapshot selection/creation, clip URL entry, publish
6. **Test detail & blind playback** — A/B player, no tally visible
7. **Voting** — technique selector, vote submission, uniqueness enforcement
8. **Reveal** — creator-only endpoint; clip_mapping join; result display
9. **Results by technique** — percentage bars for curated; qualitative list for Other
10. **System catalogue views** — by-track, by-snapshot, cross-check
11. **URL health check cron** — background job, status updates, creator notification
12. **Public feed & browsing** — home page, pagination, filters

---

## 14. Design Notes & Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Storage model | BYOS (user-supplied URLs) | Avoids storage costs; users already have preferred providers |
| Video support | Treated as default, no special handling | Most users record on phones; video is the easiest format |
| Blind test integrity | No audio extraction or video hiding | Creators typically frame away from equipment; community self-regulates |
| Before/after mapping | Separate `clip_mapping` table | Structural isolation; RLS policy controls access precisely |
| Components model | JSONB array on snapshot | Avoids rigid taxonomy; flexible for v1; can normalise in v2 |
| Technique list | Curated seed + single "Other" | Protects cross-test comparability; "Other" seeds future nominations |
| Multi-technique voting | One vote per (user, test, technique) | Richer data; different techniques may legitimately diverge |
| Tally visibility | Hidden until user votes or test revealed | Prevents anchoring bias in listeners |
| Tracks | Shared across users | Same track referenced by multiple creators; builds a shared catalogue |
| Snapshots | Append-only | Historical integrity; old clips always reference valid snapshots |
| Cross-check tests | Reuse existing clip URLs | No new recording needed; enables direct non-adjacent comparison |
