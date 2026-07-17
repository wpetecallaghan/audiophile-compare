// Shared by the feed (components/feed/FeedCard.tsx), the test detail page
// (app/tests/[id]/page.tsx), and MappingBadge (step 65, per-clip snapshot
// display) — one implementation of "which two snapshots are being compared,"
// rather than writing the same join/format logic in multiple places. This
// helper has no visibility opinion of its own — callers gate it behind
// canSeeSystemInfo (step 43) before ever calling it, passing null for either
// side once a viewer isn't entitled to see it.
export type SnapshotSummary = { label: string; system: { name: string } | null } | null

// Exported (step 65) so MappingBadge can format a single side on its own —
// formatSnapshotLine's "A vs B" join isn't the shape it needs.
export function formatOneSnapshot(snapshot: SnapshotSummary): string | null {
  if (!snapshot) return null
  return `${snapshot.system?.name ?? '?'} · ${snapshot.label}`
}

export function formatSnapshotLine(snapshotA: SnapshotSummary, snapshotB: SnapshotSummary): string {
  return [formatOneSnapshot(snapshotA), formatOneSnapshot(snapshotB)]
    .filter((part): part is string => part !== null)
    .join('  vs  ')
}
