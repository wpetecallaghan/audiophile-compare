import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'
import { createAdminClient } from '@/lib/supabase/admin'
import type { IngestPayload } from '@/lib/ingestion/ingest-test-payload'

// Hits real staging Supabase — see vitest.integration.config.ts and
// testing.md §11. Requires NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (staging) in .env.local, same as Playwright's
// e2e/global-setup.ts.
//
// Data hygiene: every track/system/test title this file creates is
// prefixed [E2E] and deleted in afterAll, in the FK-safe order testing.md
// §5 documents (votes → clip_mapping → clips → tests → system_snapshots →
// systems → tracks). The placeholder authors/voters themselves are NOT
// deleted — deterministic usernames below are a permanent fixture, the
// same pattern as E2E_TEST_USER_EMAIL (testing.md §5 rule 1): re-running
// this file resolves them via the existing import_authors mapping instead
// of creating duplicates.

const INGEST_SECRET = 'integration-test-secret'

const AUTHOR_1 = 'e2e-ingest-author-1'
const AUTHOR_2 = 'e2e-ingest-author-2'
const VOTER_1 = 'e2e-ingest-voter-1'
const VOTER_2 = 'e2e-ingest-voter-2'

const TRACK_ARTIST = '[E2E] Ingest Artist'
const TRACK_TITLE = '[E2E] Ingest Track'
const SYSTEM_NAME = '[E2E] Ingest Shared System'
const TECHNIQUE = 'Tune Method'

const SOURCE_REF_1 = 'lejonklou-forum:e2e-integration-test:post-1'
const SOURCE_REF_IDEMPOTENCY = 'lejonklou-forum:e2e-integration-test:post-idempotency'
const SOURCE_REF_2 = 'lejonklou-forum:e2e-integration-test:post-2'
const SOURCE_REF_3 = 'lejonklou-forum:e2e-integration-test:post-3'

function payload(overrides: Partial<IngestPayload>): IngestPayload {
  return {
    source_ref: SOURCE_REF_1,
    author: { forum_username: AUTHOR_1 },
    track: { artist: TRACK_ARTIST, title: TRACK_TITLE },
    snapshot_a: { system_name: SYSTEM_NAME, version_label: 'v1 baseline' },
    snapshot_b: { system_name: SYSTEM_NAME, version_label: 'v2 new DAC' },
    clip_a_url: 'https://example.com/e2e-ingest-a.mp3',
    clip_b_url: 'https://example.com/e2e-ingest-b.mp3',
    before_is_a: true,
    ...overrides,
  }
}

async function callIngest(body: IngestPayload) {
  const request = new NextRequest('http://localhost/api/internal/ingest', {
    method: 'POST',
    headers: { 'x-ingest-secret': INGEST_SECRET, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const response = await POST(request)
  return { status: response.status, body: await response.json() }
}

describe('POST /api/internal/ingest (integration)', () => {
  const admin = createAdminClient()
  const testIds: string[] = []

  beforeAll(() => {
    process.env.INGEST_SECRET = INGEST_SECRET
  })

  afterAll(async () => {
    // Fail loudly rather than silently leaving orphaned staging rows behind
    // (an earlier version of this cleanup swallowed a foreign-key error
    // here and leaked a track/system pair into staging undetected).
    async function del(table: string, apply: (q: ReturnType<typeof admin.from>) => unknown) {
      const { error } = await apply(admin.from(table)) as { error: { message: string } | null }
      if (error) throw new Error(`cleanup failed deleting from ${table}: ${error.message}`)
    }

    if (testIds.length > 0) {
      await del('votes', (q) => q.delete().in('test_id', testIds))
      await del('clip_mapping', (q) => q.delete().in('test_id', testIds))
      await del('clips', (q) => q.delete().in('test_id', testIds))
      await del('tests', (q) => q.delete().in('id', testIds))
    }

    const { data: systems } = await admin
      .from('systems')
      .select('id')
      .eq('name', SYSTEM_NAME)

    const systemIds = (systems ?? []).map((s) => s.id)
    if (systemIds.length > 0) {
      await del('system_snapshots', (q) => q.delete().in('system_id', systemIds))
      await del('systems', (q) => q.delete().in('id', systemIds))
    }

    await del('tracks', (q) => q.delete().eq('artist', TRACK_ARTIST).eq('title', TRACK_TITLE))
  })

  it('creates a test, resolves the post author and both voters, and records both votes', async () => {
    const { status, body } = await callIngest(
      payload({
        source_url: 'https://www.lejonklou.com/forum/viewtopic.php?f=2&t=3233#p187',
        votes: [
          { voter: { forum_username: VOTER_1 }, chosen_label: 'A', technique_name: TECHNIQUE },
          { voter: { forum_username: VOTER_2 }, chosen_label: 'B', technique_name: TECHNIQUE },
          // Duplicate from VOTER_1 on the same technique — should be
          // silently skipped, not error the whole import (decision 3).
          { voter: { forum_username: VOTER_1 }, chosen_label: 'A', technique_name: TECHNIQUE },
        ],
      }),
    )

    expect(status).toBe(201)
    expect(body.alreadyImported).toBe(false)
    testIds.push(body.testId)

    const { count } = await admin
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', body.testId)

    expect(count).toBe(2)

    const { data: testRow } = await admin
      .from('tests')
      .select('source_url')
      .eq('id', body.testId)
      .single()

    expect(testRow?.source_url).toBe('https://www.lejonklou.com/forum/viewtopic.php?f=2&t=3233#p187')
  })

  it('is a no-op when re-run with the same source_ref', async () => {
    const first = await callIngest(payload({ source_ref: SOURCE_REF_IDEMPOTENCY }))
    expect(first.status).toBe(201)
    testIds.push(first.body.testId)

    const { status, body } = await callIngest(payload({ source_ref: SOURCE_REF_IDEMPOTENCY }))

    expect(status).toBe(200)
    expect(body.alreadyImported).toBe(true)
    expect(body.testId).toBe(first.body.testId)
  })

  it('reuses an existing system under the same author instead of duplicating it', async () => {
    const { body } = await callIngest(
      payload({
        source_ref: SOURCE_REF_2,
        snapshot_a: { system_name: SYSTEM_NAME, version_label: 'v3 new cables' },
        snapshot_b: { system_name: SYSTEM_NAME, version_label: 'v2 new DAC' },
      }),
    )
    testIds.push(body.testId)

    const { data: systems } = await admin
      .from('systems')
      .select('id, owner_id')
      .eq('name', SYSTEM_NAME)

    // AUTHOR_1's system should still be a single row despite two ingest
    // calls naming it — filtered to AUTHOR_1's placeholder below.
    const { data: importAuthor } = await admin
      .from('import_authors')
      .select('user_id')
      .eq('source', 'lejonklou-forum')
      .eq('external_username', AUTHOR_1)
      .single()

    const author1Systems = (systems ?? []).filter((s) => s.owner_id === importAuthor?.user_id)
    expect(author1Systems).toHaveLength(1)
  })

  it('gives two different authors using the same system name two distinct systems', async () => {
    const { body } = await callIngest(
      payload({
        source_ref: SOURCE_REF_3,
        author: { forum_username: AUTHOR_2 },
      }),
    )
    testIds.push(body.testId)

    const { data: systems, count } = await admin
      .from('systems')
      .select('id, owner_id', { count: 'exact' })
      .eq('name', SYSTEM_NAME)

    const distinctOwners = new Set((systems ?? []).map((s) => s.owner_id))
    expect(count).toBe(2)
    expect(distinctOwners.size).toBe(2)
  })

  it('rejects requests without a valid INGEST_SECRET', async () => {
    const request = new NextRequest('http://localhost/api/internal/ingest', {
      method: 'POST',
      headers: { 'x-ingest-secret': 'wrong-secret', 'content-type': 'application/json' },
      body: JSON.stringify(payload({ source_ref: 'lejonklou-forum:e2e-integration-test:unauthorised' })),
    })
    const response = await POST(request)
    expect(response.status).toBe(403)
  })
})
