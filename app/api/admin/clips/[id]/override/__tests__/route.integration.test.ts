import { describe, it, expect, afterAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { STATUS_OK, STATUS_DEAD } from '@/lib/clips/check-url'
import { PROVIDER_DIRECT, MEDIA_TYPE_AUDIO } from '@/lib/clips/detect-provider'

// Hits real staging Supabase — see vitest.integration.config.ts and
// testing.md §7/§11. Exercises the admin-client update directly, not
// through the HTTP route — same corrected precedent erase-user-data/
// claim's integration tests already established: a session-gated admin
// route can't be faked the way a header/secret-based one (e.g. the
// ingest route) can, so the route itself (a thin isAdminEmail/
// session-gated wrapper, mirroring erase-user-data/route.ts and claim/
// route.ts) is manually curl-verified separately, not covered here.
//
// Unlike claim_placeholder/erase_user_*, there's no Postgres function
// here — PATCH /api/admin/clips/[id]/override does a plain admin-client
// .update(), the same shape PATCH /api/clips/[id] already uses. So this
// file exercises that plain update directly instead of an .rpc() call.

const TRACK_ARTIST = '[E2E] Admin Override Artist'
const TRACK_TITLE = '[E2E] Admin Override Track'
const SYSTEM_NAME = '[E2E] Admin Override System'
const TEST_TITLE = '[E2E] Admin Override Test'

describe('clips.admin_override (integration)', () => {
  const admin = createAdminClient()
  const trackIdsToClean: string[] = []

  afterAll(async () => {
    async function del(table: string, apply: (q: ReturnType<typeof admin.from>) => unknown) {
      const { error } = (await apply(admin.from(table))) as { error: { message: string } | null }
      if (error) throw new Error(`cleanup failed deleting from ${table}: ${error.message}`)
    }

    const { data: tests } = await admin.from('tests').select('id').ilike('title', `${TEST_TITLE}%`)
    const testIds = (tests ?? []).map((t) => t.id)
    if (testIds.length > 0) {
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

    if (trackIdsToClean.length > 0) {
      await del('tracks', (q) => q.delete().in('id', trackIdsToClean))
    }
  })

  async function seedClipFixture(suffix: string) {
    const { data: userRow } = await admin.from('users').select('id').limit(1).single()
    const ownerId = userRow!.id

    const { data: track } = await admin
      .from('tracks')
      .insert({ created_by: ownerId, artist: TRACK_ARTIST, title: `${TRACK_TITLE} ${suffix}` })
      .select('id')
      .single()
    const { data: system } = await admin
      .from('systems')
      .insert({ owner_id: ownerId, name: `${SYSTEM_NAME} ${suffix}` })
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
        creator_id: ownerId,
        track_id: track!.id,
        snapshot_a_id: snapshotA!.id,
        snapshot_b_id: snapshotB!.id,
        title: `${TEST_TITLE} ${suffix}`,
        status: 'open',
      })
      .select('id')
      .single()
    const { data: clip } = await admin
      .from('clips')
      .insert({
        test_id: test!.id,
        label: 'A',
        source_url: 'https://example.com/e2e-admin-override.mp3',
        provider: PROVIDER_DIRECT,
        media_type: MEDIA_TYPE_AUDIO,
        url_status: STATUS_OK,
      })
      .select('id')
      .single()

    trackIdsToClean.push(track!.id)
    return { ownerId, clipId: clip!.id }
  }

  it('sets admin_override, admin_override_by, and admin_override_at together, then clears all three on override: null', async () => {
    const { ownerId, clipId } = await seedClipFixture(`${Date.now()}-set-clear`)

    const { error: setError } = await admin
      .from('clips')
      .update({
        admin_override: STATUS_DEAD,
        admin_override_by: ownerId,
        admin_override_at: new Date().toISOString(),
      })
      .eq('id', clipId)
    expect(setError).toBeNull()

    const { data: overridden } = await admin
      .from('clips')
      .select('admin_override, admin_override_by, admin_override_at')
      .eq('id', clipId)
      .single()
    expect(overridden?.admin_override).toBe(STATUS_DEAD)
    expect(overridden?.admin_override_by).toBe(ownerId)
    expect(overridden?.admin_override_at).not.toBeNull()

    const { error: clearError } = await admin
      .from('clips')
      .update({ admin_override: null, admin_override_by: null, admin_override_at: null })
      .eq('id', clipId)
    expect(clearError).toBeNull()

    const { data: cleared } = await admin
      .from('clips')
      .select('admin_override, admin_override_by, admin_override_at')
      .eq('id', clipId)
      .single()
    expect(cleared?.admin_override).toBeNull()
    expect(cleared?.admin_override_by).toBeNull()
    expect(cleared?.admin_override_at).toBeNull()
  })

  it('rejects an override value outside ok/dead via the CHECK constraint', async () => {
    const { clipId } = await seedClipFixture(`${Date.now()}-check-constraint`)

    const { error } = await admin
      .from('clips')
      .update({ admin_override: 'degraded' })
      .eq('id', clipId)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/clips_admin_override_check/)
  })

  it('blocks an anon-key write to admin_override (RLS — no session matches the creator-only update policy)', async () => {
    const { clipId } = await seedClipFixture(`${Date.now()}-anon-blocked`)

    const anon = createAdminClient(
      process.env.SUPABASE_URL_STAGING ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    // No error — RLS silently matches zero rows for an unauthenticated
    // caller, the same "absent error ≠ row actually changed" trap
    // api-conventions.md Rule 5 documents; verify by re-reading with the
    // admin client instead of trusting the absent error.
    await anon.from('clips').update({ admin_override: STATUS_DEAD }).eq('id', clipId)

    const { data: unchanged } = await admin
      .from('clips')
      .select('admin_override')
      .eq('id', clipId)
      .single()
    expect(unchanged?.admin_override).toBeNull()
  })
})
