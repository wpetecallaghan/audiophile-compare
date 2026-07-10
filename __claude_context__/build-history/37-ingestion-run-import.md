---
name: audiophile-compare-build-history-37
description: Build step 37 — Forum ingestion: run the import, staging then production.
---

# ✅ 37 — Forum ingestion: run the import, staging then production

The actual one-time deliverable — scrape, extract into candidates, review
and approve them, commit for real against `audiophile-staging`, manually
verify in the app, then commit the same, staging-verified set against
`audiophile-prod`. No new code; exercised steps 30–36. Confirmed for real,
independently of the user's own report — 44 usable tests now live on
production (`curl`'d the real production feed page directly and read the
rendered content, not just the local candidate-repo folder counts):
correct historical dates, varied Revealed/Blind status, real vote counts,
and step 40's system-name-prefixed titles/snapshot lines all rendering
correctly. The other 164 real candidates extracted from the thread ended
up in `broken/` (dead/missing/unplayable clip links) — see
`build-history-ingestion/35-extraction-findings.md`'s clip-health work. Full plan and
verification: `build-history-ingestion/37-run-import.md`.
