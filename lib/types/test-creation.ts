// Track as returned by /api/tracks
export type Track = {
  id: string
  artist: string
  title: string
  album: string | null
  passage_note: string | null
}

// Snapshot as returned by /api/systems
export type Snapshot = {
  id: string
  version: number
  label: string
  notes: string | null
  components: Array<{
    role: string
    make: string
    model: string
    notes?: string
  }> | null
  created_at: string
}

// System with its snapshots
export type SystemWithSnapshots = {
  id: string
  name: string
  description: string | null
  system_snapshots: Snapshot[]
}

// Result from /api/clips/verify
export type VerifiedClip = {
  provider: 'youtube' | 'vimeo' | 'direct' | 'unknown'
  media_type: 'audio' | 'video' | 'unknown'
  url_status: 'ok' | 'degraded' | 'dead'
  canonical_url: string
  embed_id: string | null
}

// The complete form state passed between wizard steps
export type TestDraft = {
  track: Track | null
  snapshotA: Snapshot | null
  snapshotB: Snapshot | null
  clipAUrl: string
  clipAVerified: VerifiedClip | null
  clipBUrl: string
  clipBVerified: VerifiedClip | null
  beforeIsA: boolean       // which clip is the 'before' system
  title: string
}