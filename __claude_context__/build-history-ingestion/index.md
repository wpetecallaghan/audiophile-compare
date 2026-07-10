---
name: audiophile-compare-build-history-ingestion-index
description: >
  Index of the forum-ingestion pipeline build steps (30, 31, 33, 35-39),
  split one file per step (step 35 further split into decisions/findings,
  since it is far larger than any other step). Load only the specific step
  file(s) relevant to your task, not this whole directory.
---

# Forum Ingestion Pipeline — Detailed Build Plan Index

Full detail for `build-history/` steps 30, 31, 33, and 35-39 (steps 32 and
34 — import provenance UI, Google Drive provider support — are UI/core-app
work, not pipeline infrastructure, and are detailed directly in
`build-history/` instead). See `deferred-features.md`'s "Forum ingestion
pipeline" section for the original architecture notes this plan builds on.

| Step | Title | File |
|---|---|---|
| 30 | Placeholder author infrastructure | [30-placeholder-author-infrastructure.md](30-placeholder-author-infrastructure.md) |
| 31 | Internal ingest API route (`POST /api/internal/ingest`) | [31-internal-ingest-api-route.md](31-internal-ingest-api-route.md) |
| 33 | Scraper | [33-scraper.md](33-scraper.md) |
| 35 | Extraction (decisions) | [35-extraction-decisions.md](35-extraction-decisions.md) |
| 35 | Extraction (findings) | [35-extraction-findings.md](35-extraction-findings.md) |
| 36 | Commit | [36-commit.md](36-commit.md) |
| 37 | Run the import: staging, then production | [37-run-import.md](37-run-import.md) |
| 38 | Data erasure requests (votes / content / full account) | [38-data-erasure-requests.md](38-data-erasure-requests.md) |
| 39 | Claim flow (merge a placeholder into a real account) | [39-claim-flow.md](39-claim-flow.md) |
