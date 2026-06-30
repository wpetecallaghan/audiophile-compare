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

  console.log(
    `${E2E_PREFIX} Teardown complete: deleted ${testIds.length} test(s), ${systemIds.length} system(s)`,
  )
}
