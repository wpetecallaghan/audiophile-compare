---
name: audiophile-compare-build-history-35
description: Build step 35 — Forum ingestion: extraction.
---

# ✅ 35 — Forum ingestion: extraction

Takes step 33's raw posts and does the hard semantic work — per-author
system/snapshot continuity (simplified to one placeholder system per
creator), clip-health filtering (reusing existing verify logic), technique
hardcoded to 'Tune Method' (the forum's stated convention), and a flagged
placeholder for tracks that can't be identified from text or clip
metadata. Reply-to-test attribution (matching a voter's reply against a
different author's open candidate) was the highest-risk open design
question; resolved architecturally as a single chronological walk over
the whole thread backed by one shared cross-author candidate index, with
a reveal closing a candidate to further matching and a 21-day
auto-expiry. Uses the Vercel AI SDK (`generateObject` + Zod, via the AI
Gateway) rather than calling ingest directly — output is a local,
human-editable candidate repository (one JSON file per candidate,
organized into `pending`/`needs_review`/`ready`/`approved`/
`ingested/staging`/`ingested/production`/`expired` subfolders — the
folder a file sits in *is* its status), never a live API call. Built,
unit-tested (34 files / 386 tests passing), and trial-run twice against
real data (a 40-page sample) — found and fixed two real bugs this way
(a label-collision bug across multi-pair posts, and the model echoing a
composite label back as a match target) and documented one accepted gap
(`ambiguous_attribution` is defined but never actually triggers). Full
plan: `build-history-ingestion/35-extraction-decisions.md` and
`build-history-ingestion/35-extraction-findings.md`.
