import { createClient } from '@supabase/supabase-js'
import { E2E_PREFIX } from './constants'
import { createPlaceholderAuthor } from '@/lib/ingestion/create-placeholder-author'
import { STATUS_OK, type UrlStatus } from '@/lib/clips/check-url'

// ---------------------------------------------------------------------------
// Admin client — bypasses RLS; use only in test setup/teardown
// ---------------------------------------------------------------------------

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ---------------------------------------------------------------------------
// Test user lookup
// ---------------------------------------------------------------------------

let _testUserId: string | undefined

export async function getTestUserId(): Promise<string> {
  if (_testUserId) return _testUserId

  const admin = createAdminClient()
  const email = process.env.E2E_TEST_USER_EMAIL!
  const { data, error } = await admin.auth.admin.listUsers()
  if (error) throw new Error(`getTestUserId: ${error.message}`)

  const user = data.users.find((u) => u.email === email)
  if (!user) throw new Error(`E2E test user not found: ${email}`)

  _testUserId = user.id
  return _testUserId
}

// ---------------------------------------------------------------------------
// Seed helpers — all names prefixed with E2E_PREFIX so teardown can find them
// ---------------------------------------------------------------------------

export type SeededSystem = { id: string; name: string }
export type SeededSnapshot = { id: string; system_id: string; version: number; label: string }
export type SeededTrack = { id: string; artist: string; title: string }
export type SeededTest = { id: string; title: string }
export type SeededClip = { id: string; test_id: string; label: string; source_url: string }

export async function seedSystem(name: string, ownerId?: string): Promise<SeededSystem> {
  const admin = createAdminClient()
  const resolvedOwnerId = ownerId ?? await getTestUserId()
  const { data, error } = await admin
    .from('systems')
    .insert({ name: `${E2E_PREFIX} ${name}`, owner_id: resolvedOwnerId, description: 'Created by E2E tests' })
    .select('id, name')
    .single()
  if (error) throw new Error(`seedSystem: ${error.message}`)
  return data as SeededSystem
}

export async function seedSnapshot(
  systemId: string,
  label: string,
  version = 1,
): Promise<SeededSnapshot> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('system_snapshots')
    .insert({ system_id: systemId, label, version })
    .select('id, system_id, version, label')
    .single()
  if (error) throw new Error(`seedSnapshot: ${error.message}`)
  return data as SeededSnapshot
}

export async function seedTrack(artist: string, title: string, createdBy?: string): Promise<SeededTrack> {
  const admin = createAdminClient()
  const resolvedCreatedBy = createdBy ?? await getTestUserId()
  const { data, error } = await admin
    .from('tracks')
    .insert({ artist, title: `${E2E_PREFIX} ${title}`, created_by: resolvedCreatedBy })
    .select('id, artist, title')
    .single()
  if (error) throw new Error(`seedTrack: ${error.message}`)
  return data as SeededTrack
}

export async function seedTest(
  trackId: string,
  snapshotAId: string,
  snapshotBId: string,
  title: string,
  creatorId?: string,
  sourceUrl?: string,
  forumLink?: string,
): Promise<SeededTest> {
  const admin = createAdminClient()
  const resolvedCreatorId = creatorId ?? await getTestUserId()
  const { data, error } = await admin
    .from('tests')
    .insert({
      creator_id: resolvedCreatorId,
      track_id: trackId,
      snapshot_a_id: snapshotAId,
      snapshot_b_id: snapshotBId,
      title: `${E2E_PREFIX} ${title}`,
      status: 'open',
      source_url: sourceUrl ?? null,
      forum_link: forumLink ?? null,
    })
    .select('id, title')
    .single()
  if (error) throw new Error(`seedTest: ${error.message}`)
  return data as SeededTest
}

// Forces a deterministic created_at on an already-seeded test — used by
// date-formatting.spec.ts (build step 49), which needs a fixed, unambiguous
// day (> 12) to tell dd/mm/yyyy apart from mm/dd/yyyy regardless of what day
// the suite happens to run.
export async function setTestCreatedAt(testId: string, isoDate: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('tests')
    .update({ created_at: isoDate })
    .eq('id', testId)
  if (error) throw new Error(`setTestCreatedAt: ${error.message}`)
}

export async function seedClipMapping(
  testId: string,
  beforeClipId: string,
  afterClipId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('clip_mapping')
    .insert({ test_id: testId, before_clip_id: beforeClipId, after_clip_id: afterClipId })
  if (error) throw new Error(`seedClipMapping: ${error.message}`)
}

export async function seedClip(
  testId: string,
  label: 'A' | 'B',
  sourceUrl: string,
  urlStatus: UrlStatus = STATUS_OK,
  provider: 'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown' = 'youtube',
  mediaType: 'audio' | 'video' | 'unknown' = 'video',
): Promise<SeededClip> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clips')
    .insert({
      test_id: testId,
      label,
      source_url: sourceUrl,
      provider,
      media_type: mediaType,
      url_status: urlStatus,
    })
    .select('id, test_id, label, source_url')
    .single()
  if (error) throw new Error(`seedClip: ${error.message}`)
  return data as SeededClip
}

// ---------------------------------------------------------------------------
// Seed a complete publishable test (track + two systems + snapshots + clips)
// ---------------------------------------------------------------------------

export type SeedTestFixture = {
  track: SeededTrack
  systemA: SeededSystem
  systemB: SeededSystem
  snapshotA: SeededSnapshot
  snapshotB: SeededSnapshot
  test: SeededTest
  clipA: SeededClip
  clipB: SeededClip
}

// Two stable YouTube video IDs unlikely to be taken down
const YOUTUBE_A = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const YOUTUBE_B = 'https://www.youtube.com/watch?v=9bZkp7q19f0'

// Default seeded-track artist name, reused across every fixture builder below
const DEFAULT_TEST_ARTIST = 'Test Artist'

export async function seedCompleteTest(
  suffix: string,
  opts: {
    clipAStatus?: UrlStatus
    clipBStatus?: UrlStatus
    clipAProvider?: 'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'
    clipBProvider?: 'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'
    clipAMediaType?: 'audio' | 'video' | 'unknown'
    clipBMediaType?: 'audio' | 'video' | 'unknown'
  } = {},
): Promise<SeedTestFixture> {
  const track = await seedTrack(DEFAULT_TEST_ARTIST, `Track ${suffix}`)
  const systemA = await seedSystem(`System A ${suffix}`)
  const systemB = await seedSystem(`System B ${suffix}`)
  const snapshotA = await seedSnapshot(systemA.id, `Snapshot A ${suffix}`)
  const snapshotB = await seedSnapshot(systemB.id, `Snapshot B ${suffix}`)
  const test = await seedTest(track.id, snapshotA.id, snapshotB.id, `Test ${suffix}`)
  const clipA = await seedClip(
    test.id, 'A', YOUTUBE_A,
    opts.clipAStatus ?? STATUS_OK,
    opts.clipAProvider ?? 'youtube',
    opts.clipAMediaType ?? 'video',
  )
  const clipB = await seedClip(
    test.id, 'B', YOUTUBE_B,
    opts.clipBStatus ?? STATUS_OK,
    opts.clipBProvider ?? 'youtube',
    opts.clipBMediaType ?? 'video',
  )
  // Clip A is "before", Clip B is "after" — a real test always has this
  // row (created by POST /api/tests); without it MappingBadge never
  // renders, so no e2e spec could actually exercise it once revealed.
  await seedClipMapping(test.id, clipA.id, clipB.id)
  return { track, systemA, systemB, snapshotA, snapshotB, test, clipA, clipB }
}

// ---------------------------------------------------------------------------
// Seed a placeholder-owned test — for the import-provenance UI (build step
// 32). Exercises the real create-placeholder-author.ts, not a duplicate —
// the placeholder author is a permanent fixture (same pattern as the real
// E2E_TEST_USER_EMAIL account), reused across runs via its existing
// import_authors mapping. Only the [E2E]-prefixed content this creates is
// torn down (see global-teardown.ts) — the placeholder identity itself
// isn't, matching testing.md §5's data-hygiene rule for permanent fixtures.
// ---------------------------------------------------------------------------

const PLACEHOLDER_FIXTURE_SOURCE = 'lejonklou-forum'
const PLACEHOLDER_FIXTURE_USERNAME = 'e2e-provenance-fixture-author'
const PLACEHOLDER_FIXTURE_SOURCE_URL = 'https://www.lejonklou.com/forum/viewtopic.php?f=2&t=3233#p187'

export async function seedPlaceholderOwnedTest(suffix: string): Promise<SeedTestFixture> {
  const placeholderUserId = await createPlaceholderAuthor({
    source: PLACEHOLDER_FIXTURE_SOURCE,
    externalUsername: PLACEHOLDER_FIXTURE_USERNAME,
  })

  const track = await seedTrack(DEFAULT_TEST_ARTIST, `Placeholder Track ${suffix}`, placeholderUserId)
  const systemA = await seedSystem(`Placeholder System A ${suffix}`, placeholderUserId)
  const systemB = await seedSystem(`Placeholder System B ${suffix}`, placeholderUserId)
  const snapshotA = await seedSnapshot(systemA.id, `Snapshot A ${suffix}`)
  const snapshotB = await seedSnapshot(systemB.id, `Snapshot B ${suffix}`)
  const test = await seedTest(
    track.id, snapshotA.id, snapshotB.id, `Placeholder Test ${suffix}`,
    placeholderUserId, PLACEHOLDER_FIXTURE_SOURCE_URL,
  )
  const clipA = await seedClip(test.id, 'A', YOUTUBE_A)
  const clipB = await seedClip(test.id, 'B', YOUTUBE_B)
  await seedClipMapping(test.id, clipA.id, clipB.id)
  return { track, systemA, systemB, snapshotA, snapshotB, test, clipA, clipB }
}

// ---------------------------------------------------------------------------
// Seed a test in the *post-claim* shape (build step 44): a real, registered
// owner (not a placeholder) whose test still carries a source_url — the
// state claim_placeholder (step 39) actually leaves behind, since it
// reassigns tests.creator_id but never touches tests.source_url. Reuses
// seedTest's own creatorId/sourceUrl params directly rather than seeding a
// throwaway placeholder and really claiming it — real claiming deletes the
// placeholder's public.users row and repoints its import_authors mapping
// permanently, so exercising the real RPC per test run would accumulate an
// orphaned import_authors row forever; unnecessary here since this UI only
// cares about the resulting is_placeholder/source_url shape, not the
// mechanism that produced it (claim_placeholder has its own dedicated
// integration test: app/api/admin/claim/__tests__/route.integration.test.ts).
// ---------------------------------------------------------------------------

export async function seedClaimedTest(suffix: string): Promise<SeedTestFixture> {
  const track = await seedTrack(DEFAULT_TEST_ARTIST, `Claimed Track ${suffix}`)
  const systemA = await seedSystem(`Claimed System A ${suffix}`)
  const systemB = await seedSystem(`Claimed System B ${suffix}`)
  const snapshotA = await seedSnapshot(systemA.id, `Snapshot A ${suffix}`)
  const snapshotB = await seedSnapshot(systemB.id, `Snapshot B ${suffix}`)
  const test = await seedTest(
    track.id, snapshotA.id, snapshotB.id, `Claimed Test ${suffix}`,
    undefined, PLACEHOLDER_FIXTURE_SOURCE_URL,
  )
  const clipA = await seedClip(test.id, 'A', YOUTUBE_A)
  const clipB = await seedClip(test.id, 'B', YOUTUBE_B)
  await seedClipMapping(test.id, clipA.id, clipB.id)
  return { track, systemA, systemB, snapshotA, snapshotB, test, clipA, clipB }
}

// ---------------------------------------------------------------------------
// Listening technique preferences (build step 45) — the real E2E test user
// is a single, persistent, shared identity across every spec file, run
// sequentially in filename order (see zz-sign-out.spec.ts's own comment on
// why it runs last). Unlike per-run [E2E]-prefixed content, narrowing this
// account's technique preferences and not resetting them would leak into
// every spec that runs afterward in the same suite invocation — so any
// test that changes them must call resetTechniquePreferences() afterward,
// typically from a test.afterEach.
// ---------------------------------------------------------------------------

export async function getActiveTechniqueIds(): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('listening_techniques')
    .select('id')
    .eq('is_active', true)
  if (error) throw new Error(`getActiveTechniqueIds: ${error.message}`)
  return (data ?? []).map((t) => t.id)
}

export async function getTechniqueIdByName(name: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('listening_techniques')
    .select('id')
    .eq('name', name)
    .single()
  if (error || !data) throw new Error(`getTechniqueIdByName: ${name} not found — ${error?.message}`)
  return data.id
}

export async function setTechniquePreferences(techniqueIds: string[]): Promise<void> {
  const admin = createAdminClient()
  const userId = await getTestUserId()
  await admin.from('user_technique_preferences').delete().eq('user_id', userId)
  const { error } = await admin
    .from('user_technique_preferences')
    .insert(techniqueIds.map((technique_id) => ({ user_id: userId, technique_id })))
  if (error) throw new Error(`setTechniquePreferences: ${error.message}`)
}

// Restores the "never customized" default (no rows = every active
// technique enabled) — the state every test that touches preferences must
// leave the shared account in when it finishes.
export async function resetTechniquePreferences(): Promise<void> {
  const admin = createAdminClient()
  const userId = await getTestUserId()
  await admin.from('user_technique_preferences').delete().eq('user_id', userId)
}
