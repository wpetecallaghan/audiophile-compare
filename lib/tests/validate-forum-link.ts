// Shared by POST /api/tests and PATCH /api/tests/[id] (step 46) — light
// sanity check for a manually-typed forum discussion link. Proportionate
// to what it's used for: this URL is only ever displayed, never played
// back, so it doesn't need clip URLs' full verify-and-detect-provider flow.
export function isValidForumLink(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
