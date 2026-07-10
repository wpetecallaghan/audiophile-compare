---
name: audiophile-compare-build-history-03
description: Build step 3 — Clip URL verification — `POST /api/clips/verify`.
---

# ✅ 3 — Clip URL verification — `POST /api/clips/verify`

`lib/clips/detect-provider.ts` — pure URL classification (no I/O).
`lib/clips/check-url.ts` — HEAD request for `direct` URLs.
`lib/clips/to-clip-data.ts` — converts verified URL into `ClipData` shape.
