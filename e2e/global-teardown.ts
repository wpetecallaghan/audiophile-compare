import { createClient } from '@supabase/supabase-js'
import { E2E_PREFIX } from './helpers/constants'

export default async function globalTeardown() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(`${E2E_PREFIX} Skipping teardown — Supabase env vars not set`)
    return
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const email = process.env.E2E_TEST_USER_EMAIL
  if (!email) {
    console.warn(`${E2E_PREFIX} Skipping teardown — E2E_TEST_USER_EMAIL not set`)
    return
  }

  // Find the test user
  const { data: listData } = await adminClient.auth.admin.listUsers()
  const testUser = listData?.users.find((u) => u.email === email)
  if (!testUser) {
    console.warn(`${E2E_PREFIX} Teardown: test user not found (${email}) — nothing to clean`)
    return
  }

  const userId = testUser.id

  // Find all prefixed tests owned by this user
  const { data: e2eTests } = await adminClient
    .from('tests')
    .select('id')
    .eq('creator_id', userId)
    .like('title', `${E2E_PREFIX}%`)

  const testIds = (e2eTests ?? []).map((t: { id: string }) => t.id)

  if (testIds.length > 0) {
    // Delete in dependency order — no ON DELETE CASCADE in the schema
    await adminClient.from('votes').delete().in('test_id', testIds)
    await adminClient.from('clip_mapping').delete().in('test_id', testIds)
    await adminClient.from('clips').delete().in('test_id', testIds)
    await adminClient.from('tests').delete().in('id', testIds)
  }

  // Find all prefixed systems owned by this user
  const { data: e2eSystems } = await adminClient
    .from('systems')
    .select('id')
    .eq('owner_id', userId)
    .like('name', `${E2E_PREFIX}%`)

  const systemIds = (e2eSystems ?? []).map((s: { id: string }) => s.id)

  if (systemIds.length > 0) {
    await adminClient.from('system_snapshots').delete().in('system_id', systemIds)
    await adminClient.from('systems').delete().in('id', systemIds)
  }

  // Delete prefixed tracks created by this user
  await adminClient
    .from('tracks')
    .delete()
    .eq('created_by', userId)
    .like('title', `${E2E_PREFIX}%`)

  // Placeholder-owned fixtures (build step 32's provenance UI spec) use a
  // different owner — a permanent placeholder identity, not the real test
  // user — so they're invisible to the sweep above. Matched via
  // is_placeholder rather than a specific user id, since any placeholder
  // fixture author qualifies; the placeholder identity itself is not
  // deleted, only its [E2E]-prefixed content.
  const { data: placeholderTests } = await adminClient
    .from('tests')
    .select('id, creator:users!creator_id(is_placeholder)')
    .like('title', `${E2E_PREFIX}%`)

  const placeholderTestIds = (placeholderTests ?? [])
    .filter((t: { creator: { is_placeholder: boolean } | { is_placeholder: boolean }[] | null }) => {
      const creator = Array.isArray(t.creator) ? t.creator[0] : t.creator
      return creator?.is_placeholder === true
    })
    .map((t: { id: string }) => t.id)

  if (placeholderTestIds.length > 0) {
    await adminClient.from('votes').delete().in('test_id', placeholderTestIds)
    await adminClient.from('clip_mapping').delete().in('test_id', placeholderTestIds)
    await adminClient.from('clips').delete().in('test_id', placeholderTestIds)
    await adminClient.from('tests').delete().in('id', placeholderTestIds)
  }

  const { data: placeholderSystems } = await adminClient
    .from('systems')
    .select('id, owner:users!owner_id(is_placeholder)')
    .like('name', `${E2E_PREFIX}%`)

  const placeholderSystemIds = (placeholderSystems ?? [])
    .filter((s: { owner: { is_placeholder: boolean } | { is_placeholder: boolean }[] | null }) => {
      const owner = Array.isArray(s.owner) ? s.owner[0] : s.owner
      return owner?.is_placeholder === true
    })
    .map((s: { id: string }) => s.id)

  if (placeholderSystemIds.length > 0) {
    await adminClient.from('system_snapshots').delete().in('system_id', placeholderSystemIds)
    await adminClient.from('systems').delete().in('id', placeholderSystemIds)
  }

  const { data: placeholderTracks } = await adminClient
    .from('tracks')
    .select('id, creator:users!created_by(is_placeholder)')
    .like('title', `${E2E_PREFIX}%`)

  const placeholderTrackIds = (placeholderTracks ?? [])
    .filter((t: { creator: { is_placeholder: boolean } | { is_placeholder: boolean }[] | null }) => {
      const creator = Array.isArray(t.creator) ? t.creator[0] : t.creator
      return creator?.is_placeholder === true
    })
    .map((t: { id: string }) => t.id)

  if (placeholderTrackIds.length > 0) {
    await adminClient.from('tracks').delete().in('id', placeholderTrackIds)
  }

  console.log(
    `${E2E_PREFIX} Teardown complete: deleted ${testIds.length} test(s), ${systemIds.length} system(s), ` +
    `${placeholderTestIds.length} placeholder-owned test(s), ${placeholderSystemIds.length} placeholder-owned system(s)`,
  )
}
