---
name: audiophile-compare-entry
description: >
  Entry point for any coding task on the Audiophile Compare project. Provides
  project orientation and routes to the right context file for your task.
  Read this at the start of any session before loading task-specific files.
---

# Audiophile Compare — Entry Point

Blind A/B comparison app for hi-fi audio systems. Next.js 16+ App Router, Supabase (Postgres + Auth), Tailwind CSS, Vercel. Steps 1–44 complete (core app plus the forum-ingestion pipeline through a real production import, data erasure requests, the claim flow, hiding blind-test system identity, and preserving provenance links after a claim) — see `build-history/index.md` and `build-history-ingestion/index.md`. 38 unit test files / 439 tests passing.

## Step 1 — Always read core.md first

`__claude_context__/core.md` has the full file layout, deployment topology, and build status. Read it before any coding task.

## Step 2 — Load the context file for your task

| Task | Load |
|---|---|
| API routes | `api-conventions.md` + `audiophile-compare-schema.md` |
| Components / pages | `components.md` |
| Tests | `testing.md` |
| Queries / migrations / RLS | `audiophile-compare-schema.md` |
| Build history / orientation | `build-history/index.md`, then the specific step file |
| Forum ingestion pipeline (scraper, extraction, commit, rollback, erasure) | `build-history-ingestion/index.md`, then the specific step file |
| Deferred features (ingestion, storage, mobile) | `deferred-features.md` |
| Writing or reviewing code (app or test) that repeats a string literal | `repeated-string-constants.md` |

## Key invariants (apply to every task)

- Default to server components. Add `'use client'` only when required — see `components.md §1`.
- Client components **cannot** import `lib/supabase/server.ts`.
- `clip_mapping` is never returned to the client until `tests.status = 'revealed'` or the caller is the test creator — see `api-conventions.md §4`.
- System/snapshot identity (`canSeeSystemInfo`) is never disclosed until `tests.status = 'revealed'` or the caller is the test creator — see `api-conventions.md` Rule 9.
- All user-facing strings go in `messages/en.json` — never hardcoded in components.
- Migrations apply to staging first, then production.
