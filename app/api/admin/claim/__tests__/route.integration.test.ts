import { describe, it, expect, afterAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPlaceholderAuthor } from '@/lib/ingestion/create-placeholder-author'
import { PROVIDER_DIRECT, MEDIA_TYPE_AUDIO } from '@/lib/clips/detect-provider'

// Hits real staging Supabase — see vitest.integration.config.ts and
// testing.md §7/§11. Exercises claim_placeholder directly via .rpc(),
// not through the HTTP route — same corrected precedent
// erase-user-data/__tests__/route.integration.test.ts established: a
// session-gated admin route can't be faked the way a header/secret-based
// one can, so the route itself (a thin isAdminEmail/session-gated
// wrapper around this function, mirroring erase-user-data/route.ts) is
// manually curl-verified separately, not covered here.
//
// Unlike erase_user_votes/erase_user_content, claim_placeholder actually
// deletes the placeholder's identity — there's no reusable permanent
// placeholder fixture the way TARGET_USERNAME is in the erasure test
// file. Each test creates its own disposable placeholder and disposable
// real user, suffixed with Date.now() so re-runs never collide.

const TRACK_ARTIST = '[E2E] Claim Artist'
const TRACK_TITLE = '[E2E] Claim Track'
const SYSTEM_NAME = '[E2E] Claim System'
const TEST_TITLE = '[E2E] Claim Test'
const TECHNIQUE = 'Tune Method'
const PLACEHOLDER_SOURCE = 'lejonklou-forum'
const REAL_EMAIL_DOMAIN = 'import.audiophile-compare.uk'

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
      title: `${TEST_TITLE} ${suffix}`,
      status: 'open',
    })
    .select('id')
    .single()

  const { data: clipA } = await admin
    .from('clips')
    .insert({
      test_id: test!.id,
      label: 'A',
      source_url: 'https://example.com/e2e-claim-a.mp3',
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
      source_url: 'https://example.com/e2e-claim-b.mp3',
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

async function createDisposableRealUser(admin: ReturnType<typeof createAdminClient>, suffix: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `e2e-claim-real-${suffix}@${REAL_EMAIL_DOMAIN}`,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`failed to create disposable real user: ${error?.message}`)
  return data.user.id
}

describe('claim_placeholder (integration)', () => {
  const admin = createAdminClient()
  const trackIdsToClean: string[] = []
  const orphanedAuthIdsToClean: string[] = []

  afterAll(async () => {
    // Best-effort — most rows are already gone by the time each test
    // finishes (that's what's under test). Fail loudly on anything
    // unexpected left behind rather than silently leaking staging rows.
    async function del(table: string, apply: (q: ReturnType<typeof admin.from>) => unknown) {
      const { error } = (await apply(admin.from(table))) as { error: { message: string } | null }
      if (error) throw new Error(`cleanup failed deleting from ${table}: ${error.message}`)
    }

    const { data: tests } = await admin.from('tests').select('id').ilike('title', `${TEST_TITLE}%`)
    const testIds = (tests ?? []).map((t) => t.id)
    if (testIds.length > 0) {
      await del('votes', (q) => q.delete().in('test_id', testIds))
      await del('comments', (q) => q.delete().in('test_id', testIds))
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

    for (const id of orphanedAuthIdsToClean) {
      await admin.auth.admin.deleteUser(id)
    }
  })

  it('reassigns all five FK columns, repoints import_authors (not delete), deletes the placeholder, and admin.auth.admin.deleteUser succeeds afterward', async () => {
    const suffix = `${Date.now()}-full`
    const placeholderUsername = `e2e-claim-target-${suffix}`
    const placeholderId = await createPlaceholderAuthor({ source: PLACEHOLDER_SOURCE, externalUsername: placeholderUsername })
    const realUserId = await createDisposableRealUser(admin, suffix)
    orphanedAuthIdsToClean.push(placeholderId, realUserId)

    const fixture = await seedTestFixture(admin, placeholderId, suffix)

    await admin.from('votes').insert({
      test_id: fixture.test.id,
      user_id: placeholderId,
      chosen_clip_id: fixture.clipA.id,
      technique_id: fixture.techniqueId,
    })
    const { data: comment } = await admin
      .from('comments')
      .insert({ test_id: fixture.test.id, user_id: placeholderId, body: '[E2E] placeholder comment' })
      .select('id')
      .single()

    // Step 45 — a placeholder never actually sets these itself in
    // practice (placeholders never log in), but the reassignment must
    // still work correctly if one somehow exists.
    await admin
      .from('user_technique_preferences')
      .insert({ user_id: placeholderId, technique_id: fixture.techniqueId })

    const { data, error } = await admin.rpc('claim_placeholder', {
      placeholder_user_id: placeholderId,
      real_user_id: realUserId,
    })
    expect(error).toBeNull()
    expect(data).toEqual({
      systems_reassigned: 1,
      tests_reassigned: 1,
      tracks_reassigned: 1,
      comments_reassigned: 1,
      votes_reassigned: 1,
      votes_dropped_collision: 0,
      technique_prefs_reassigned: 1,
      technique_prefs_dropped_collision: 0,
      import_authors_repointed: 1,
    })

    const { data: system } = await admin.from('systems').select('owner_id').eq('id', fixture.system.id).single()
    expect(system?.owner_id).toBe(realUserId)

    const { data: test } = await admin.from('tests').select('creator_id').eq('id', fixture.test.id).single()
    expect(test?.creator_id).toBe(realUserId)

    const { data: track } = await admin.from('tracks').select('created_by').eq('id', fixture.track.id).single()
    expect(track?.created_by).toBe(realUserId)

    const { data: commentRow } = await admin.from('comments').select('user_id').eq('id', comment!.id).single()
    expect(commentRow?.user_id).toBe(realUserId)

    const { data: vote } = await admin.from('votes').select('user_id').eq('test_id', fixture.test.id).single()
    expect(vote?.user_id).toBe(realUserId)

    const { data: techniquePref } = await admin
      .from('user_technique_preferences')
      .select('user_id')
      .eq('technique_id', fixture.techniqueId)
      .eq('user_id', realUserId)
      .maybeSingle()
    expect(techniquePref?.user_id).toBe(realUserId)

    // Repointed, not deleted — the provenance record survives, now
    // pointing at the real user.
    const { data: mapping } = await admin
      .from('import_authors')
      .select('user_id')
      .eq('source', PLACEHOLDER_SOURCE)
      .eq('external_username', placeholderUsername)
      .single()
    expect(mapping?.user_id).toBe(realUserId)

    const { data: placeholderProfile } = await admin.from('users').select('id').eq('id', placeholderId).maybeSingle()
    expect(placeholderProfile).toBeNull()

    // public.users is already gone — admin.auth.admin.deleteUser() (the
    // application-code step this SQL function can't do itself) must
    // still succeed against the now-orphaned auth identity.
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(placeholderId)
    expect(authDeleteError).toBeNull()

    trackIdsToClean.push(fixture.track.id)
  })

  it("drops the placeholder's colliding vote in favour of the real user's own vote, rather than erroring the whole merge", async () => {
    const suffix = `${Date.now()}-collision`
    const placeholderUsername = `e2e-claim-collision-${suffix}`
    const placeholderId = await createPlaceholderAuthor({ source: PLACEHOLDER_SOURCE, externalUsername: placeholderUsername })
    const realUserId = await createDisposableRealUser(admin, suffix)
    orphanedAuthIdsToClean.push(placeholderId, realUserId)

    const fixture = await seedTestFixture(admin, placeholderId, suffix)

    // The real user already voted this test+technique before the claim —
    // their own vote must win (decision 5).
    await admin.from('votes').insert({
      test_id: fixture.test.id,
      user_id: realUserId,
      chosen_clip_id: fixture.clipA.id,
      technique_id: fixture.techniqueId,
    })
    await admin.from('votes').insert({
      test_id: fixture.test.id,
      user_id: placeholderId,
      chosen_clip_id: fixture.clipB.id,
      technique_id: fixture.techniqueId,
    })

    // Same collision shape for technique preferences — both the real user
    // and the placeholder have a preference row for the same technique.
    await admin
      .from('user_technique_preferences')
      .insert({ user_id: realUserId, technique_id: fixture.techniqueId })
    await admin
      .from('user_technique_preferences')
      .insert({ user_id: placeholderId, technique_id: fixture.techniqueId })

    const { data, error } = await admin.rpc('claim_placeholder', {
      placeholder_user_id: placeholderId,
      real_user_id: realUserId,
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({
      votes_reassigned: 0,
      votes_dropped_collision: 1,
      technique_prefs_reassigned: 0,
      technique_prefs_dropped_collision: 1,
    })

    // Scoped to this test's own two users — Tune Method is a shared global
    // technique, so an unscoped query would also pick up rows left behind
    // by other runs (disposable real users' rows are never explicitly
    // cleaned up in this file, same as their public.users rows).
    const { data: techniquePrefs } = await admin
      .from('user_technique_preferences')
      .select('user_id')
      .eq('technique_id', fixture.techniqueId)
      .in('user_id', [placeholderId, realUserId])
    expect(techniquePrefs).toHaveLength(1)
    expect(techniquePrefs?.[0].user_id).toBe(realUserId)

    const { data: votes } = await admin
      .from('votes')
      .select('user_id, chosen_clip_id')
      .eq('test_id', fixture.test.id)
    expect(votes).toHaveLength(1)
    expect(votes?.[0].user_id).toBe(realUserId)
    expect(votes?.[0].chosen_clip_id).toBe(fixture.clipA.id)

    trackIdsToClean.push(fixture.track.id)
  })

  it('rejects anonymous-key access (EXECUTE lockdown)', async () => {
    const anon = createAdminClient(
      process.env.SUPABASE_URL_STAGING ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const result = await anon.rpc('claim_placeholder', {
      placeholder_user_id: '00000000-0000-0000-0000-000000000000',
      real_user_id: '00000000-0000-0000-0000-000000000001',
    })
    expect(result.error).not.toBeNull()
  })
})
