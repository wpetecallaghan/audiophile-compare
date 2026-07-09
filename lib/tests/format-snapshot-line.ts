// Shared by the feed (components/feed/FeedCard.tsx) and the test detail
// page (app/tests/[id]/page.tsx, build-history.md step 40 Part A) — one
// implementation of "which two snapshots are being compared," rather than
// writing the same join/format logic in both places. Deliberately neutral
// information: naming which two snapshots are compared never discloses
// which one is "before"/"after" or which one people preferred, so callers
// show this unconditionally, not gated behind reveal status.
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
