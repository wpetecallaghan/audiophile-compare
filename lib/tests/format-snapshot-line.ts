// Shared by the feed (components/feed/FeedCard.tsx) and the test detail
// page (app/tests/[id]/page.tsx) — one implementation of "which two
// snapshots are being compared," rather than writing the same join/format
// logic in both places. This helper has no visibility opinion of its own —
// callers gate it behind canSeeSystemInfo (step 43) before ever calling it,
// passing null for either side once a viewer isn't entitled to see it.
export type SnapshotSummary = { label: string; system: { name: string } | null } | null

function formatOneSnapshot(snapshot: SnapshotSummary): string | null {
  if (!snapshot) return null
  return `${snapshot.system?.name ?? '?'} · ${snapshot.label}`
}

export function formatSnapshotLine(snapshotA: SnapshotSummary, snapshotB: SnapshotSummary): string {
  return [formatOneSnapshot(snapshotA), formatOneSnapshot(snapshotB)]
    .filter((part): part is string => part !== null)
    .join('  vs  ')
}
