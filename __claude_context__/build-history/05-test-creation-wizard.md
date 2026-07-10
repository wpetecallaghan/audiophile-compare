---
name: audiophile-compare-build-history-05
description: Build step 5 — Test creation wizard (`CreateTestForm`).
---

# ✅ 5 — Test creation wizard (`CreateTestForm`)

Multi-step wizard: Track → Snapshots → Clips → Publish.
`systems` is fetched server-side and held in local `useState` so inline creations update the wizard UI without a page reload. Steps do **not** call `router.refresh()`.
- **Inline snapshot creation:** `StepSnapshots` calls `onSnapshotCreated(systemId, snap)`; `CreateTestForm` merges into local state and auto-selects the new snapshot.
- **Inline system creation:** `StepSnapshots` calls `onSystemCreated(system)`; `CreateTestForm` prepends to local state.

Tests: `components/tests/__tests__/StepSnapshots.test.tsx` (28 tests).
