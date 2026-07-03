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

### Video and blind test integrity
Video is treated as the default recording format — most users record on mobile phones and video is the path of least resistance. No audio extraction or video hiding is applied by default. Creators typically frame recordings away from the equipment, so visual bias is low in practice. A simple label ("video test") is shown to voters when clips are video. The `playback_mode` concept was considered and rejected in favour of this simpler approach.

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
