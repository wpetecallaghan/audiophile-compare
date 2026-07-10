---
name: audiophile-compare-build-history-06
description: Build step 6 — Test detail page + blind playback.
---

# ✅ 6 — Test detail page + blind playback

Server page (`app/tests/[id]/page.tsx`) fetches test data without `clip_mapping`.
`ABPlayer` renders both clips; tally section is hidden until viewer has voted or test is revealed.
