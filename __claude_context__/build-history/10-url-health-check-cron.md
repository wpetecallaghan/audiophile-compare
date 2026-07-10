---
name: audiophile-compare-build-history-10
description: Build step 10 — URL health check cron.
---

# ✅ 10 — URL health check cron

`GET /api/cron/check-urls` — HEAD-checks all `provider='direct'` clips, regardless
of test status (doc corrected in step 27 — this originally said "in open tests," but
the query has never had a test-status filter).
Uses admin (service role) client. Daily at 02:00 UTC via `vercel.json`. Protected by `CRON_SECRET` env var.
