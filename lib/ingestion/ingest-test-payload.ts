// Canonical shape POSTed to /api/internal/ingest, and the pure validation/
// derivation logic around it. Factored out of the route so it stays unit
// testable — API routes themselves aren't unit-tested in this project
// (see testing.md), but this logic is plain data transformation, not a
// route concern.

export type IngestAuthor = {
  forum_username: string
  display_name?: string
}

export type IngestVote = {
  voter: IngestAuthor
  chosen_label: 'A' | 'B'
  technique_name: string
  observation?: string
  other_description?: string
}

export type IngestPayload = {
  source_ref: string
  source_url?: string
  title?: string
  author: IngestAuthor
  track: { artist: string; title: string; album?: string; passage_note?: string }
  snapshot_a: { system_name: string; version_label: string; components?: object[] }
  snapshot_b: { system_name: string; version_label: string; components?: object[] }
  clip_a_url: string
  clip_b_url: string
  before_is_a: boolean
  votes?: IngestVote[]
}

export type IngestValidationResult =
  | { valid: true; payload: IngestPayload }
  | { valid: false; error: string }

// Runtime validation for an untrusted request body — this route has no
// other caller-side type safety (the scraper, step 33, is a separate
// process), so every required field is checked explicitly.
export function validateIngestPayload(body: unknown): IngestValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, error: 'Request body must be a JSON object' }
  }

  const p = body as Partial<IngestPayload>

  if (!p.source_ref?.trim()) {
    return { valid: false, error: 'source_ref is required' }
  }
  if (!p.author?.forum_username?.trim()) {
    return { valid: false, error: 'author.forum_username is required' }
  }
  if (!p.track?.artist?.trim() || !p.track?.title?.trim()) {
    return { valid: false, error: 'track.artist and track.title are required' }
  }
  if (!p.snapshot_a?.system_name?.trim() || !p.snapshot_a?.version_label?.trim()) {
    return { valid: false, error: 'snapshot_a.system_name and snapshot_a.version_label are required' }
  }
  if (!p.snapshot_b?.system_name?.trim() || !p.snapshot_b?.version_label?.trim()) {
    return { valid: false, error: 'snapshot_b.system_name and snapshot_b.version_label are required' }
  }
  if (!p.clip_a_url?.trim() || !p.clip_b_url?.trim()) {
    return { valid: false, error: 'clip_a_url and clip_b_url are required' }
  }
  if (typeof p.before_is_a !== 'boolean') {
    return { valid: false, error: 'before_is_a must be a boolean' }
  }

  for (const [i, vote] of (p.votes ?? []).entries()) {
    if (!vote.voter?.forum_username?.trim()) {
      return { valid: false, error: `votes[${i}].voter.forum_username is required` }
    }
    if (vote.chosen_label !== 'A' && vote.chosen_label !== 'B') {
      return { valid: false, error: `votes[${i}].chosen_label must be 'A' or 'B'` }
    }
    if (!vote.technique_name?.trim()) {
      return { valid: false, error: `votes[${i}].technique_name is required` }
    }
  }

  return { valid: true, payload: p as IngestPayload }
}

// Falls back to "<artist> – <title>" when the caller doesn't supply one —
// forum posts rarely have a ready-made test title the way the web
// creation wizard's form field does.
export function resolveTestTitle(payload: IngestPayload): string {
  return payload.title?.trim() || `${payload.track.artist} – ${payload.track.title}`
}
