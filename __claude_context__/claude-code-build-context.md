# Build Context: Audiophile Comparison App
## New Chat Thread — Working with Claude Code

This document provides full context for starting a new conversation with Claude about building and testing the audiophile comparison web application using Claude Code and VS Code.

---

## 1. Who I am — developer background

- **IDE:** VS Code (experienced user)
- **SQL:** Expert — comfortable writing complex queries, JOINs, indexes, migrations, stored procedures
- **HTTP / REST:** Experienced — understand request/response cycle, headers, status codes, API design
- **HTML:** Familiar — comfortable reading and writing markup
- **JavaScript / TypeScript:** Beginner — understand the basics but need guidance on idioms, patterns, and tooling
- **Back-end experience:** .NET, Java, Go — strong server-side instincts, understand concepts like middleware, dependency injection, connection pooling, background jobs
- **React / Next.js:** No prior experience — starting fresh

**Implication for how we work:** I will understand architectural and data-layer explanations quickly. I will need more explanation around JS/TS patterns, React component structure, and Next.js conventions. Please explain JS-specific idioms rather than assuming familiarity.

---

## 2. What we are building

A web application for audiophile and hi-fi enthusiasts to share, compare, and collaboratively evaluate recordings of audio systems under test. Core features:

- Blind A/B listening tests: two audio/video clips uploaded to user's own storage (URL-based), shown as Clip A and Clip B
- Creator controls when the before/after identity is revealed
- Voting by listening technique (curated list: Tune Method, PRaT, Tonal, Soundstage, General, Other)
- One vote per user per technique per test; multiple techniques per listener allowed
- System catalogue: systems → snapshots (append-only, like git commits) → components (JSONB)
- Track catalogue: shared across users; links recordings across sessions
- Cross-check feature: compare any two snapshots directly using existing clip recordings
- Vote tally hidden until the user votes or the test is revealed
- Public browsing; login required to play clips, vote, or comment

---

## 3. Chosen technology stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server components keep before/after mapping server-side only |
| Hosting | Vercel | Zero-config Next.js deployment |
| Database | Supabase (Postgres) | RLS, auth, all in one platform |
| Auth | Supabase Auth | Magic link + OAuth (Google, Microsoft to be added later) |
| File storage | None — BYOS | Users supply URLs (YouTube, Vimeo, Dropbox, direct links) |
| Styling | Tailwind CSS | Mobile-first |
| Media playback | Native `<audio>` / `<video>` + iframe for YouTube/Vimeo | No additional library for v1 |
| Background jobs | Vercel Cron | URL health checks |

---

## 4. Complete database schema

```sql
-- Users (managed by Supabase Auth; profile created on first login)
users (
  id           uuid PRIMARY KEY,  -- matches auth.users.id
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

-- Point-in-time configuration of a system (append-only — never modified)
system_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id   uuid NOT NULL REFERENCES systems(id),
  version     int NOT NULL,
  label       text NOT NULL,
  notes       text,
  components  jsonb,   -- [{role, make, model, notes}, ...]
  created_at  timestamptz DEFAULT now(),
  UNIQUE (system_id, version)
)

-- Musical passage used as a test reference (shared across users)
tracks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by    uuid NOT NULL REFERENCES users(id),
  artist        text NOT NULL,
  title         text NOT NULL,
  album         text,
  passage_note  text,
  created_at    timestamptz DEFAULT now()
)

-- A blind A/B comparison between two system snapshots using a specific track
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

-- One of the two media clips in a test
clips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     uuid NOT NULL REFERENCES tests(id),
  label       text NOT NULL,    -- 'A' or 'B' only — never 'before'/'after' until reveal
  source_url  text NOT NULL,
  provider    text NOT NULL,    -- 'youtube' | 'vimeo' | 'direct' | 'unknown'
  media_type  text NOT NULL,    -- 'audio' | 'video' | 'unknown'
  url_status  text NOT NULL DEFAULT 'ok',  -- 'ok' | 'degraded' | 'dead'
  duration_ms int,
  created_at  timestamptz DEFAULT now()
)

-- SECURITY-CRITICAL: stores before/after mapping — never exposed until reveal
-- RLS: readable only when tests.revealed_at IS NOT NULL OR tests.creator_id = auth.uid()
clip_mapping (
  test_id        uuid PRIMARY KEY REFERENCES tests(id),
  before_clip_id uuid NOT NULL REFERENCES clips(id),
  after_clip_id  uuid NOT NULL REFERENCES clips(id)
)

-- Curated listening techniques (seeded at deployment; admin-managed only)
listening_techniques (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  is_other    boolean NOT NULL DEFAULT false,  -- true for the single "Other" row only
  is_active   boolean NOT NULL DEFAULT true
)

-- Seed data for listening_techniques:
-- ('Tune Method', 'Assesses rhythmic coherence, pace, and timing — whether the music flows naturally', 1, false, true)
-- ('PRaT', 'Pace, Rhythm and Timing — focuses on drive and rhythmic momentum', 2, false, true)
-- ('Tonal / Frequency balance', 'Assesses bass weight, midrange presence, treble extension and tonal naturalness', 3, false, true)
-- ('Soundstage & imaging', 'Width, depth, and specificity of instrument placement', 4, false, true)
-- ('General preference', 'No specific methodology — overall impression', 5, false, true)
-- ('Other', 'A different approach not listed above — please describe it', 6, true, true)

-- Votes: one per user per technique per test
votes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id           uuid NOT NULL REFERENCES tests(id),
  user_id           uuid NOT NULL REFERENCES users(id),
  chosen_clip_id    uuid NOT NULL REFERENCES clips(id),
  technique_id      uuid NOT NULL REFERENCES listening_techniques(id),
  other_description text,   -- required when technique.is_other = true
  observation       text,   -- optional: what did the listener notice?
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

## 5. Key security rules (must be enforced server-side, not just in UI)

1. **Before/after identity:** `clip_mapping` is never returned to the client until `tests.status = 'revealed'`. The reveal endpoint is gated: only `tests.creator_id = auth.uid()` may call it. All queries involving `clip_mapping` run in server components or API routes only.

2. **Vote tally visibility:** The vote tally for a test is not returned to a client until either the requesting user has already cast at least one vote on that test, OR `tests.status = 'revealed'`. Enforced in API routes / server components — not in the UI.

3. **Clip playback:** Requires login. Visitors see the test feed but cannot play clips.

4. **Ownership checks:** Revealing a test, creating a test, and managing snapshots all require login + ownership verification.

---

## 6. API routes to implement

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/tests` | Public | Paginated test feed |
| POST | `/api/tests` | Required | Create a test |
| GET | `/api/tests/[id]` | Public | Test detail (no clip_mapping) |
| POST | `/api/tests/[id]/reveal` | Creator only | Reveal before/after |
| GET | `/api/tests/[id]/results` | Post-vote or revealed | Vote tallies by technique |
| POST | `/api/votes` | Required | Cast a vote |
| PUT | `/api/votes/[id]` | Owner only | Update vote before reveal |
| POST | `/api/clips/verify` | Required | Validate clip URL (HEAD + provider detection) |
| GET | `/api/systems` | Required | List user's systems |
| POST | `/api/systems` | Required | Create a system |
| POST | `/api/systems/[id]/snapshots` | Required | Create a snapshot |
| GET | `/api/tracks` | Required | Search/list tracks |
| POST | `/api/tracks` | Required | Create a track |
| GET | `/api/techniques` | Public | List active listening techniques |

---

## 7. MediaPlayer component — rendering logic

The `MediaPlayer` component must handle four cases based on the clip's `provider` and `media_type`:

| Provider | Rendering |
|---|---|
| `youtube` | `<iframe src="https://www.youtube.com/embed/{id}">` using YouTube iframe API for play/pause control |
| `vimeo` | `<iframe src="https://player.vimeo.com/video/{id}">` using Vimeo player API |
| `direct` + `media_type=audio` | `<audio controls src={source_url}>` |
| `direct` + `media_type=video` | `<video controls src={source_url}>` |
| `unknown` | Plain link with a warning |

**Important:** Pausing Clip A when Clip B starts playing must be implemented for all provider types. Native `<audio>` and `<video>` elements share the JS API (`.play()`, `.pause()`). YouTube and Vimeo require their respective iframe APIs.

---

## 8. Page structure

| Page | Route | Auth required |
|---|---|---|
| Home / test feed | `/` | Public |
| Test detail | `/tests/[id]` | Public (play/vote requires login) |
| Create test | `/tests/new` | Yes |
| My systems | `/systems` | Yes |
| System detail + snapshots | `/systems/[id]` | Yes |
| Track catalogue | `/tracks` | Yes |
| Profile | `/profile` | Yes |

---

## 9. Recommended build order

Build in this sequence — it validates the hardest and most novel parts first:

1. **Supabase project setup** — schema migration, RLS policies, seed listening techniques
2. **Auth** — Supabase Auth with Next.js middleware; magic link login; protected routes
3. **Clip URL verification** — `/api/clips/verify`; provider detection from URL; HEAD request validation
4. **MediaPlayer component** — all four rendering cases; play/pause synchronisation between A and B
5. **Test creation flow** — track selection/creation → snapshot selection/creation → clip URL entry → publish
6. **Test detail and blind playback** — A/B player; tally hidden; no clip_mapping in response
7. **Voting** — technique selector; vote submission; uniqueness enforcement
8. **Reveal** — creator-only endpoint; clip_mapping join; result display
9. **Results by technique** — percentage bars for curated; qualitative list for Other
10. **System catalogue views** — by-track, by-snapshot, cross-check (anti-local-maxima feature)
11. **URL health check cron** — Vercel Cron job; HEAD-ping active clips; update url_status
12. **Public feed and browsing** — home page; pagination; filters

---

## 10. How I want to work with Claude Code

### Tool setup
- I use VS Code — please guide me to install and configure the Claude Code VS Code extension
- I want to use Claude Code to read my project files directly rather than pasting code into chat
- Please tell me what to install and configure before we write the first line of code

### Working style preferences
- Explain JS/TS patterns and React/Next.js conventions — do not assume familiarity
- My SQL background is strong — lean on SQL analogies where they help (e.g. RLS policies are like row-filtered views with a WHERE clause based on the current user)
- I understand HTTP well — API route design explanations can be concise
- When writing code, prefer explicit and readable over clever and terse — I will be reading and maintaining this
- Always tell me what a file does before showing it, and explain any pattern that is specific to Next.js App Router conventions
- When there are multiple ways to do something, briefly say what the options are and recommend one with a reason rather than just showing one approach

### Testing approach
- I want to write tests as I go, not retrospectively
- Please recommend a testing approach for Next.js + Supabase that fits a beginner-intermediate JS skill level
- I want to be able to run tests locally before pushing to Vercel

### What to do first in the new conversation
The starting prompt for this thread is:

> I am building a Next.js 14 (App Router) web application with Supabase for auth and database, to be deployed on Vercel. I have a complete architecture specification (attached). My background: expert SQL, experienced with HTTP and back-end development in .NET/Java/Go, familiar with HTML, beginner with JavaScript and no prior React or Next.js experience. I use VS Code. Please help me set up my development environment and Claude Code, then guide me through the first step of the build: creating the Supabase project, running the schema migration, applying RLS policies, and seeding the listening techniques table.

---

## 11. Reference — design decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Storage model | BYOS (user-supplied URLs) | No storage costs; users have preferred providers |
| Video support | Treated as default format, no special handling | Most users record on phones; video is easiest |
| Blind test integrity | No audio extraction or video hiding | Creators frame away from equipment; community self-regulates |
| Before/after mapping | Separate `clip_mapping` table | Structural isolation; RLS policy controls access precisely |
| Components model | JSONB array on snapshot | Avoids rigid taxonomy in v1; can normalise later |
| Technique list | Curated seed + single "Other" | Protects cross-test comparability; Other seeds future nominations |
| Multi-technique voting | One vote per (user, test, technique) | Different techniques may legitimately diverge |
| Tally visibility | Hidden until user votes or test revealed | Prevents anchoring bias |
| Tracks | Shared across users | Builds a shared catalogue; enables cross-user comparison |
| Snapshots | Append-only | Historical integrity; old clips always reference valid snapshots |
| Cross-check tests | Reuse existing clip URLs | No new recording needed; enables non-adjacent comparison |
| Technique governance | Curated by app; "Other" is free text excluded from analytics | Protects data quality; Other seeds future technique nominations |
