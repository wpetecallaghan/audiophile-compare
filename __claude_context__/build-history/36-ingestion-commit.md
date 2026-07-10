---
name: audiophile-compare-build-history-36
description: Build step 36 — Forum ingestion: commit.
---

# ✅ 36 — Forum ingestion: commit

Separate, simple script, parameterized by target environment — reads
`approved/` for staging or `ingested/staging/` for production (never the
other way around, enforcing "staging first" at the tooling level) and
POSTs each candidate to `/api/internal/ingest`, moving successes into that
environment's `ingested/` folder. The only step that touches a deployed
environment; no LLM, no judgment calls. Also where two real bugs were
found and fixed by reviewing the first real commit on staging (test
reveal status never set regardless of vote count; `created_at` always
defaulted to ingestion time) — see `build-history-ingestion/36-commit.md`
findings 8–9 for the full account, including a real process mistake
(editing an already-applied migration file, which silently no-ops on
`supabase db push`) worth reading for the general lesson. Full plan and
verification: `build-history-ingestion/36-commit.md`.
