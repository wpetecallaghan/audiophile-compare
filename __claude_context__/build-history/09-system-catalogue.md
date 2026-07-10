---
name: audiophile-compare-build-history-09
description: Build step 9 — System catalogue.
---

# ✅ 9 — System catalogue

Tracks list, track detail, systems list, system detail with win/loss per snapshot, cross-check selector.
- **Inline snapshot on system detail:** `AddSnapshotForm` (client, owner-only) calls `router.refresh()` on success — contrast with wizard which uses local state.
- **Snapshot editing:** `SnapshotSection` (client-with-server-children pattern); `PATCH /api/systems/[id]/snapshots/[snapshotId]`.
- **System create/edit:** `CreateSystemForm` and `EditSystemForm`; pages `/systems/new` and `/systems/[id]/edit`.
