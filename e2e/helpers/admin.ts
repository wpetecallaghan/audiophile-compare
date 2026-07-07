import { createClient } from '@supabase/supabase-js'
import { E2E_PREFIX } from './constants'
import { createPlaceholderAuthor } from '@/lib/ingestion/create-placeholder-author'

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
    })
    .select('id, title')
    .single()
  if (error) throw new Error(`seedTest: ${error.message}`)
  return data as SeededTest
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
  urlStatus: 'ok' | 'degraded' | 'dead' = 'ok',
  provider: 'youtube' | 'vimeo' | 'direct' | 'unknown' = 'youtube',
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

export async function seedCompleteTest(
  suffix: string,
  opts: {
    clipAStatus?: 'ok' | 'degraded' | 'dead'
    clipBStatus?: 'ok' | 'degraded' | 'dead'
    clipAProvider?: 'youtube' | 'vimeo' | 'direct' | 'unknown'
    clipBProvider?: 'youtube' | 'vimeo' | 'direct' | 'unknown'
    clipAMediaType?: 'audio' | 'video' | 'unknown'
    clipBMediaType?: 'audio' | 'video' | 'unknown'
  } = {},
): Promise<SeedTestFixture> {
  const track = await seedTrack('Test Artist', `Track ${suffix}`)
  const systemA = await seedSystem(`System A ${suffix}`)
  const systemB = await seedSystem(`System B ${suffix}`)
  const snapshotA = await seedSnapshot(systemA.id, `Snapshot A ${suffix}`)
  const snapshotB = await seedSnapshot(systemB.id, `Snapshot B ${suffix}`)
  const test = await seedTest(track.id, snapshotA.id, snapshotB.id, `Test ${suffix}`)
  const clipA = await seedClip(
    test.id, 'A', YOUTUBE_A,
    opts.clipAStatus ?? 'ok',
    opts.clipAProvider ?? 'youtube',
    opts.clipAMediaType ?? 'video',
  )
  const clipB = await seedClip(
    test.id, 'B', YOUTUBE_B,
    opts.clipBStatus ?? 'ok',
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

  const track = await seedTrack('Test Artist', `Placeholder Track ${suffix}`, placeholderUserId)
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
