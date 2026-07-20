import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPlaceholderAuthor } from '@/lib/ingestion/create-placeholder-author'
import { PROVIDER_DIRECT, MEDIA_TYPE_AUDIO } from '@/lib/clips/detect-provider'

// Hits real staging Supabase — see vitest.integration.config.ts and
// testing.md §7/§11. Exercises the three erase_user_* Postgres functions
// directly via .rpc(), not through the HTTP route — API routes aren't
// integration-tested directly in this project (see testing.md); the
// route itself is a thin isAdminEmail/session-gated wrapper around these
// functions, already covered by the same pattern app/version/page.tsx
// uses with no dedicated test file of its own. Manually curl-verified
// separately that the route's unauthenticated paths (401/redirect) work.
//
// Data hygiene: every track/system/test title created here is prefixed
// [E2E]. Fixed placeholder usernames (source 'lejonklou-forum') are
// permanent fixtures, same pattern as route.integration.test.ts's own
// AUTHOR_1/VOTER_1 — re-running this file resolves them via their
// existing import_authors mapping rather than creating duplicates. The
// one real registered (non-placeholder) user this file creates for the
// erase_user_account tests is fully disposable — created fresh in
// beforeAll and deleted for real by the tests themselves, not a
// permanent fixture.

const TRACK_ARTIST = '[E2E] Erasure Artist'
const TRACK_TITLE = '[E2E] Erasure Track'
const SYSTEM_NAME = '[E2E] Erasure System'
const TECHNIQUE = 'Tune Method'

const PLACEHOLDER_SOURCE = 'lejonklou-forum'
const TARGET_USERNAME = 'e2e-erasure-target'
const OTHER_VOTER_USERNAME = 'e2e-erasure-other-voter'

async function seedTestFixture(
  admin: ReturnType<typeof createAdminClient>,
  creatorId: string,
  suffix: string,
) {
  const { data: technique } = await admin
    .from('listening_techniques')
    .select('id')
    .eq('name', TECHNIQUE)
    .single()

  const { data: track } = await admin
    .from('tracks')
    .insert({ created_by: creatorId, artist: TRACK_ARTIST, title: `${TRACK_TITLE} ${suffix}` })
    .select('id')
    .single()

  const { data: system } = await admin
    .from('systems')
    .insert({ owner_id: creatorId, name: `${SYSTEM_NAME} ${suffix}` })
    .select('id')
    .single()

  const { data: snapshotA } = await admin
    .from('system_snapshots')
    .insert({ system_id: system!.id, version: 1, label: 'v1' })
    .select('id')
    .single()
  const { data: snapshotB } = await admin
    .from('system_snapshots')
    .insert({ system_id: system!.id, version: 2, label: 'v2' })
    .select('id')
    .single()

  const { data: test } = await admin
    .from('tests')
    .insert({
      creator_id: creatorId,
      track_id: track!.id,
      snapshot_a_id: snapshotA!.id,
      snapshot_b_id: snapshotB!.id,
      title: `[E2E] Erasure Test ${suffix}`,
      status: 'open',
    })
    .select('id')
    .single()

  const { data: clipA } = await admin
    .from('clips')
    .insert({
      test_id: test!.id,
      label: 'A',
      source_url: 'https://example.com/e2e-erasure-a.mp3',
      provider: PROVIDER_DIRECT,
      media_type: MEDIA_TYPE_AUDIO,
      url_status: 'ok',
    })
    .select('id')
    .single()
  const { data: clipB } = await admin
    .from('clips')
    .insert({
      test_id: test!.id,
      label: 'B',
      source_url: 'https://example.com/e2e-erasure-b.mp3',
      provider: PROVIDER_DIRECT,
      media_type: MEDIA_TYPE_AUDIO,
      url_status: 'ok',
    })
    .select('id')
    .single()

  await admin
    .from('clip_mapping')
    .insert({ test_id: test!.id, before_clip_id: clipA!.id, after_clip_id: clipB!.id })

  return { track: track!, system: system!, test: test!, clipA: clipA!, clipB: clipB!, techniqueId: technique!.id }
}

describe('erase_user_votes / erase_user_content / erase_user_account (integration)', () => {
  const admin = createAdminClient()
  let targetPlaceholderId: string
  let otherVoterId: string
  const trackIdsToClean: string[] = []

  beforeAll(async () => {
    targetPlaceholderId = await createPlaceholderAuthor({
      source: PLACEHOLDER_SOURCE,
      externalUsername: TARGET_USERNAME,
    })
    otherVoterId = await createPlaceholderAuthor({
      source: PLACEHOLDER_SOURCE,
      externalUsername: OTHER_VOTER_USERNAME,
    })
  })

  afterAll(async () => {
    // Best-effort — most rows are already gone by the time each test
    // finishes (that's what's under test). Fail loudly on anything
    // unexpected left behind rather than silently leaking staging rows.
    async function del(table: string, apply: (q: ReturnType<typeof admin.from>) => unknown) {
      const { error } = (await apply(admin.from(table))) as { error: { message: string } | null }
      if (error) throw new Error(`cleanup failed deleting from ${table}: ${error.message}`)
    }

    const { data: tests } = await admin.from('tests').select('id').ilike('title', '[E2E] Erasure Test%')
    const testIds = (tests ?? []).map((t) => t.id)
    if (testIds.length > 0) {
      await del('votes', (q) => q.delete().in('test_id', testIds))
      await del('clip_mapping', (q) => q.delete().in('test_id', testIds))
      await del('clips', (q) => q.delete().in('test_id', testIds))
      await del('tests', (q) => q.delete().in('id', testIds))
    }

    const { data: systems } = await admin.from('systems').select('id').ilike('name', `${SYSTEM_NAME}%`)
    const systemIds = (systems ?? []).map((s) => s.id)
    if (systemIds.length > 0) {
      await del('system_snapshots', (q) => q.delete().in('system_id', systemIds))
      await del('systems', (q) => q.delete().in('id', systemIds))
    }

    await del('tracks', (q) => q.delete().eq('artist', TRACK_ARTIST))

    if (trackIdsToClean.length > 0) {
      await del('tracks', (q) => q.delete().in('id', trackIdsToClean))
    }
  })

  it('erase_user_votes deletes exactly the target user\'s votes, leaving a different user\'s vote on the same test untouched', async () => {
    const fixture = await seedTestFixture(admin, targetPlaceholderId, 'votes-case')

    await admin.from('votes').insert({
      test_id: fixture.test.id,
      user_id: targetPlaceholderId,
      chosen_clip_id: fixture.clipA.id,
      technique_id: fixture.techniqueId,
    })
    await admin.from('votes').insert({
      test_id: fixture.test.id,
      user_id: otherVoterId,
      chosen_clip_id: fixture.clipB.id,
      technique_id: fixture.techniqueId,
    })

    const { data, error } = await admin.rpc('erase_user_votes', { target_user_id: targetPlaceholderId })
    expect(error).toBeNull()
    expect(data).toEqual({ votes_deleted: 1 })

    const { count: targetVotes } = await admin
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', fixture.test.id)
      .eq('user_id', targetPlaceholderId)
    expect(targetVotes).toBe(0)

    const { count: otherVotes } = await admin
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', fixture.test.id)
      .eq('user_id', otherVoterId)
    expect(otherVotes).toBe(1)

    // The test/track/system themselves are untouched by this scope —
    // clean them up directly so the next test starts fresh.
    await admin.from('votes').delete().eq('test_id', fixture.test.id)
    await admin.from('clip_mapping').delete().eq('test_id', fixture.test.id)
    await admin.from('clips').delete().eq('test_id', fixture.test.id)
    await admin.from('tests').delete().eq('id', fixture.test.id)
    await admin.from('system_snapshots').delete().eq('system_id', fixture.system.id)
    await admin.from('systems').delete().eq('id', fixture.system.id)
    trackIdsToClean.push(fixture.track.id)
  })

  it('erase_user_content deletes the target\'s test(s) and system(s) fully, including a vote cast by a different user', async () => {
    const fixture = await seedTestFixture(admin, targetPlaceholderId, 'content-case')

    await admin.from('votes').insert({
      test_id: fixture.test.id,
      user_id: otherVoterId,
      chosen_clip_id: fixture.clipA.id,
      technique_id: fixture.techniqueId,
    })

    const { data, error } = await admin.rpc('erase_user_content', { target_user_id: targetPlaceholderId })
    expect(error).toBeNull()
    expect(data).toEqual({ tests_deleted: 1, systems_deleted: 1, votes_deleted: 1 })

    const { data: survivingTest } = await admin.from('tests').select('id').eq('id', fixture.test.id).maybeSingle()
    expect(survivingTest).toBeNull()

    const { data: survivingSystem } = await admin.from('systems').select('id').eq('id', fixture.system.id).maybeSingle()
    expect(survivingSystem).toBeNull()

    const { count: survivingVotes } = await admin
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', fixture.test.id)
    expect(survivingVotes).toBe(0)

    // Track is never touched by erase_user_content (decision 3) — confirm
    // it survives, then clean it up directly (it's not reachable via any
    // status folder or automatic sweep the way tests/systems are).
    const { data: survivingTrack } = await admin.from('tracks').select('id').eq('id', fixture.track.id).maybeSingle()
    expect(survivingTrack).not.toBeNull()
    trackIdsToClean.push(fixture.track.id)
  })

  it('erase_user_account nulls tracks.created_by for the target\'s own tracks, deletes the account, and admin.auth.admin.deleteUser succeeds afterward', async () => {
    // A genuinely disposable, real (non-placeholder) registered user —
    // not the permanent E2E_TEST_USER_EMAIL fixture.
    const email = `e2e-erasure-account-${Date.now()}@import.audiophile-compare.uk`
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    })
    expect(createError).toBeNull()
    const realUserId = created!.user!.id

    const { data: track } = await admin
      .from('tracks')
      .insert({ created_by: realUserId, artist: TRACK_ARTIST, title: `${TRACK_TITLE} account-case` })
      .select('id')
      .single()

    const { data, error } = await admin.rpc('erase_user_account', { target_user_id: realUserId })
    expect(error).toBeNull()
    expect(data).toEqual({ tracks_orphaned: 1, account_deleted: true })

    const { data: survivingTrack } = await admin.from('tracks').select('id, created_by').eq('id', track!.id).single()
    expect(survivingTrack?.created_by).toBeNull()

    const { data: survivingProfile } = await admin.from('users').select('id').eq('id', realUserId).maybeSingle()
    expect(survivingProfile).toBeNull()

    // public.users is already gone — admin.auth.admin.deleteUser() (the
    // application-code step this SQL function can't do itself) must
    // still succeed against the now-orphaned auth identity.
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(realUserId)
    expect(authDeleteError).toBeNull()

    await admin.from('tracks').delete().eq('id', track!.id)
  })

  it('erase_user_votes/erase_user_content leave import_authors and the placeholder\'s own account untouched', async () => {
    const { data: mapping } = await admin
      .from('import_authors')
      .select('user_id')
      .eq('source', PLACEHOLDER_SOURCE)
      .eq('external_username', TARGET_USERNAME)
      .single()
    expect(mapping?.user_id).toBe(targetPlaceholderId)

    const { data: profile } = await admin.from('users').select('id').eq('id', targetPlaceholderId).maybeSingle()
    expect(profile).not.toBeNull()
  })

  it('rejects anonymous-key access to all three functions (EXECUTE lockdown)', async () => {
    const anon = createAdminClient(
      process.env.SUPABASE_URL_STAGING ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const votesResult = await anon.rpc('erase_user_votes', { target_user_id: targetPlaceholderId })
    expect(votesResult.error).not.toBeNull()

    const contentResult = await anon.rpc('erase_user_content', { target_user_id: targetPlaceholderId })
    expect(contentResult.error).not.toBeNull()

    const accountResult = await anon.rpc('erase_user_account', { target_user_id: targetPlaceholderId })
    expect(accountResult.error).not.toBeNull()
  })
})
