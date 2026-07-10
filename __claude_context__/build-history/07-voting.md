---
name: audiophile-compare-build-history-07
description: Build step 7 — Voting.
---

# ✅ 7 — Voting

`POST /api/votes` (cast); `PATCH /api/votes/[id]` (update before reveal).
One vote per (user, test, technique) — `UNIQUE` constraint enforced at DB layer.
