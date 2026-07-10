---
name: audiophile-compare-build-history-04
description: Build step 4 — MediaPlayer — YouTube / Vimeo / native / unknown.
---

# ✅ 4 — MediaPlayer — YouTube / Vimeo / native / unknown

A/B coordination via `forwardRef` + `useImperativeHandle`. `ABPlayer` owns both refs and pauses the inactive clip when the other plays. All player components follow the `forwardRef` + `PlayerHandle` contract — see `components.md` §5.
