import { createClient } from '@supabase/supabase-js'
import { E2E_PREFIX } from './constants'

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
export type SeededClip = { id: string; test_id: string; label: string }

export async function seedSystem(name: string): Promise<SeededSystem> {
  const admin = createAdminClient()
  const userId = await getTestUserId()
  const { data, error } = await admin
    .from('systems')
    .insert({ name: `${E2E_PREFIX} ${name}`, owner_id: userId, description: 'Created by E2E tests' })
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

export async function seedTrack(artist: string, title: string): Promise<SeededTrack> {
  const admin = createAdminClient()
  const userId = await getTestUserId()
  const { data, error } = await admin
    .from('tracks')
    .insert({ artist, title: `${E2E_PREFIX} ${title}`, created_by: userId })
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
): Promise<SeededTest> {
  const admin = createAdminClient()
  const userId = await getTestUserId()
  const { data, error } = await admin
    .from('tests')
    .insert({
      creator_id: userId,
      track_id: trackId,
      snapshot_a_id: snapshotAId,
      snapshot_b_id: snapshotBId,
      title: `${E2E_PREFIX} ${title}`,
      status: 'open',
    })
    .select('id, title')
    .single()
  if (error) throw new Error(`seedTest: ${error.message}`)
  return data as SeededTest
}

export async function seedClip(
  testId: string,
  label: 'A' | 'B',
  sourceUrl: string,
  urlStatus: 'ok' | 'degraded' | 'dead' = 'ok',
): Promise<SeededClip> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clips')
    .insert({
      test_id: testId,
      label,
      source_url: sourceUrl,
      provider: 'youtube',
      media_type: 'video',
      url_status: urlStatus,
    })
    .select('id, test_id, label')
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
  opts: { clipAStatus?: 'ok' | 'degraded' | 'dead'; clipBStatus?: 'ok' | 'degraded' | 'dead' } = {},
): Promise<SeedTestFixture> {
  const track = await seedTrack('Test Artist', `Track ${suffix}`)
  const systemA = await seedSystem(`System A ${suffix}`)
  const systemB = await seedSystem(`System B ${suffix}`)
  const snapshotA = await seedSnapshot(systemA.id, `Snapshot A ${suffix}`)
  const snapshotB = await seedSnapshot(systemB.id, `Snapshot B ${suffix}`)
  const test = await seedTest(track.id, snapshotA.id, snapshotB.id, `Test ${suffix}`)
  const clipA = await seedClip(test.id, 'A', YOUTUBE_A, opts.clipAStatus ?? 'ok')
  const clipB = await seedClip(test.id, 'B', YOUTUBE_B, opts.clipBStatus ?? 'ok')
  return { track, systemA, systemB, snapshotA, snapshotB, test, clipA, clipB }
}
