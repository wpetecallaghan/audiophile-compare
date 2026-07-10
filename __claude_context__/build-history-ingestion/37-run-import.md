---
name: audiophile-compare-build-history-ingestion-37
description: Forum ingestion step 37 — Run the import: staging, then production.
---

# ✅ 37 — Run the import: staging, then production

**The gap this closes:** everything above is infrastructure; this step is
the actual, one-time deliverable the user asked for — Lejonklou playground
thread content actually present in the app.

**Decisions:**

1. **Staging first, always production second** — matching this project's
   established migration convention (`CLAUDE.md`: "Migrations apply
   independently to each project — apply to staging first, then
   production") extended to data operations, not just schema. As of step
   34's `--env` design, this isn't just a documented convention to
   remember to follow — production's commit input (`ingested/staging/`)
   physically doesn't exist until a staging commit has produced it.
2. **Not a single rigid pass — scrape/extract can loop, before the
   staging commit.** Scrape the thread; run extraction; review the
   resulting `needs_review` candidates (resolve or accept each) and
   spot-check `ready` ones; approve what's ready to go. Re-scraping and
   re-running extraction is safe and incremental (step 35 decision 4), so
   this can repeat as needed before anything is committed.
3. Run `commit-lejonklou.ts --env staging` for real against
   `audiophile-staging`. Manually verify a sample of imported tests render
   correctly in the actual app (test detail page, system snapshot history,
   track pages) — not just "the API call succeeded."
4. Once satisfied, run `commit-lejonklou.ts --env production` — **not** a
   fresh scrape/extract/approve cycle. This commits exactly the
   candidate set that just passed staging verification (step 36 decision
   1's folder chain makes this the only thing this command can do — it
   reads `ingested/staging/`, which is precisely that set). If more forum
   content has appeared since the staging run and you want it included
   too, that's a new, separate full pipeline run — scrape → extract →
   review/approve → commit to staging → verify → commit to production —
   not something folded into finishing this one.

**Not part of this step:** the user-merge/claim flow (letting a real
Lejonklou member claim their imported content once they join) is
explicitly deferred — see below. Import rollback (step 38) is a documented
safety net that sits alongside this step, not a dependency of it.

**Tests:** none new — this step *exercises* steps 30–36, it doesn't add
code. Verification is the manual review described above.

**Verified:** run for real by the user — every usable candidate committed
to both `audiophile-staging` and `audiophile-prod`. Confirmed
independently, not just taken on report: `curl`'d the real production
feed (`https://audiophile-compare.uk/`) and read the rendered HTML
directly. 20 distinct `/tests/<id>` links on page 1 (`PAGE_SIZE=20`,
`app/page.tsx`); real content spot-checked in the rendered text —
`"markiteight's system · REM – Sweetness Follows"` (step 40 Part B's
title format), a matching `"markiteight's system · ... vs
markiteight's system · ..."` snapshot line (step 40 Part A), varied real
historical dates (`5/18/2026`, `3/15/2026`, `10/22/2025`, …, not a single
ingestion-time cluster — confirms step 36 finding 8/9's `created_at` fix
reached production), varied `Revealed`/`Blind` status badges (confirms
the `revealed_at`/`status` fix), and real non-zero vote counts. Local
candidate-repo state corroborates: `ingested/production/` holds all 44
usable candidates, every other open-pipeline folder
(`pending`/`needs_review`/`ready`/`approved`/`ingested/staging`) is empty,
and `broken/` holds the other 164 real candidates extracted from the
thread whose clip links were genuinely dead, missing, or unplayable (step
35's clip-health work) — 44 + 164 = 208, matching the earlier
`backfill-payload-created-at.ts` run's total, so every real candidate
this pipeline ever produced is accounted for in exactly one terminal
state. `git log`/`git status` also confirm every code change from steps
36 and 40 (the reveal/date/source_url fixes, the rollback tooling, the
snapshot-line and title-format UI work) was committed and deployed before
this run — the rendered production content above wouldn't show any of
step 40's formatting otherwise.

---
