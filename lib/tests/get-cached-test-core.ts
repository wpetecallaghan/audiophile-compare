import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/client'
import type { UrlStatus } from '@/lib/clips/check-url'

// Shared with app/tests/[id]/page.tsx — the raw clips row shape, once
// resolved into ABPlayer's ClipData via toClipData.
export type RawClip = {
  id: string
  label: string
  source_url: string
  provider: string
  media_type: string
  url_status: string
  admin_override: UrlStatus | null
}

export type SnapshotJoin = { label: string; system: { name: string } | { name: string }[] | null }

export type CachedTestCore = {
  id: string
  title: string
  status: string
  revealed_at: string | null
  created_at: string
  source_url: string | null
  source_ref: string | null
  forum_link: string | null
  creator_id: string
  creator: { display_name: string | null; is_placeholder: boolean } | { display_name: string | null; is_placeholder: boolean }[] | null
  track: { artist: string; title: string; album: string | null; passage_note: string | null } | { artist: string; title: string; album: string | null; passage_note: string | null }[] | null
  clips: RawClip[]
  snapshot_a: SnapshotJoin | SnapshotJoin[] | null
  snapshot_b: SnapshotJoin | SnapshotJoin[] | null
}

// The actual query, pulled out of the unstable_cache wrapper below so it
// has something unit-testable to call: unstable_cache throws
// ("Invariant: incrementalCache missing") outside a real Next.js request
// context, so it can't run inside Vitest at all (confirmed directly — same
// class of limitation as lib/supabase/server.ts). This inner function is
// plain, exported, and mockable; only the thin caching wrapper around it
// is untestable, and that's exercised against a real server instead (see
// build-history/75-*.md's verification section).
//
// The test row + track + clips + snapshots is identical for every viewer —
// nothing in this query filters by user id, and the per-viewer redaction
// (canSeeSystemInfo, forum-link visibility) already happens in JS after
// the fetch, in app/tests/[id]/page.tsx, not by varying this query. Safe
// to cache and share across every visitor's request.
//
// Uses lib/supabase/client.ts's browser-style (anon-key) client rather
// than lib/supabase/server.ts deliberately — unstable_cache forbids
// dynamic APIs (cookies()/headers()) inside the cached function, and
// lib/supabase/server.ts's createClient() calls cookies() internally.
// These tables don't need a session anyway: tests/clips/tracks are all
// RLS "public read" (audiophile-compare-schema.md's policy summary,
// including tracks since step 70's fix), so an anon-key read returns
// exactly the same row regardless of who's asking.
export async function fetchTestCore(testId: string): Promise<CachedTestCore | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tests')
    .select(`
      id, title, status, revealed_at, created_at, source_url, source_ref, forum_link,
      creator_id,
      creator:users!creator_id(display_name, is_placeholder),
      track:tracks(artist, title, album, passage_note),
      clips(id, label, source_url, provider, media_type, url_status, admin_override),
      snapshot_a:system_snapshots!snapshot_a_id(label, system:systems(name)),
      snapshot_b:system_snapshots!snapshot_b_id(label, system:systems(name))
    `)
    .eq('id', testId)
    .single()

  return error || !data ? null : (data as unknown as CachedTestCore)
}

// Invalidated via revalidateTag(`test-${testId}`, { expire: 0 }) from
// every route that mutates a field in this shape — see build-history/75-*.md
// for the full list. Deliberately NOT invalidated by the URL-health-check
// cron (clips.url_status) — bounded staleness via `revalidate` below
// instead; see that same doc for why.
export async function getCachedTestCore(testId: string): Promise<CachedTestCore | null> {
  const cached = unstable_cache(
    () => fetchTestCore(testId),
    ['test-core', testId],
    { tags: [`test-${testId}`], revalidate: 3600 },
  )

  return cached()
}

// clip_mapping's own RLS policy is "revealed OR creator_id = auth.uid()"
// (audiophile-compare-schema.md's "clip_mapping policy" section). Querying
// it with the anon-key client above (no session, so auth.uid() is null)
// naturally returns a row ONLY for a revealed test — the creator-branch
// can never match without a real session — so this is safe to call
// unconditionally once the caller already knows isRevealed is true,
// without re-deriving that from a dynamic per-request check. The
// pre-reveal creator case stays on app/tests/[id]/page.tsx's existing
// dynamic, cookie-based fetch — genuinely personalized, not cacheable.
export async function fetchRevealedMapping(
  testId: string,
): Promise<{ before_clip_id: string; after_clip_id: string } | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('clip_mapping')
    .select('before_clip_id, after_clip_id')
    .eq('test_id', testId)
    .single()

  return data ?? null
}

export async function getCachedRevealedMapping(
  testId: string,
): Promise<{ before_clip_id: string; after_clip_id: string } | null> {
  const cached = unstable_cache(
    () => fetchRevealedMapping(testId),
    ['test-mapping', testId],
    { tags: [`test-${testId}`], revalidate: 3600 },
  )

  return cached()
}
