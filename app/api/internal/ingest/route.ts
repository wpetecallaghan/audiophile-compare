import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPlaceholderAuthor } from '@/lib/ingestion/create-placeholder-author'
import { validateIngestPayload, resolveTestTitle, type IngestAuthor } from '@/lib/ingestion/ingest-test-payload'
import { detectProvider } from '@/lib/clips/detect-provider'

// Only one forum is in scope today — add a `source` field to IngestPayload
// only if/when a second forum is actually being ingested (see
// build-history-ingestion.md step 31, decision 2).
const FORUM_SOURCE = 'lejonklou-forum'

// Resolves each *distinct* voter exactly once. Two votes from the same
// commenter (a routine occurrence — one person often cites more than one
// technique) must not call createPlaceholderAuthor concurrently for the
// same forum_username: its resolve-or-create check isn't safe against a
// concurrent duplicate of itself, and two parallel createUser calls for
// the same derived email would race. Distinct usernames don't share state,
// so resolving those in parallel is safe.
async function resolveVoterIds(voters: IngestAuthor[]): Promise<Map<string, string>> {
  const unique = new Map<string, IngestAuthor>()
  for (const voter of voters) {
    unique.set(voter.forum_username, voter)
  }

  const resolved = await Promise.all(
    Array.from(unique.values()).map(async (voter) => {
      const userId = await createPlaceholderAuthor({
        source: FORUM_SOURCE,
        externalUsername: voter.forum_username,
        displayName: voter.display_name,
      })
      return [voter.forum_username, userId] as const
    }),
  )

  return new Map(resolved)
}

// POST /api/internal/ingest
//
// Server-to-server only — not part of any public/browser surface. Protected
// by a shared secret, not Supabase Auth. See build-history-ingestion.md
// step 31 and api-conventions.md §5.
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-ingest-secret')
  if (!process.env.INGEST_SECRET || secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const result = validateIngestPayload(body)
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const payload = result.payload

  // Each placeholder author (the post author, and separately each voter)
  // resolves or creates its own auth.users/public.users row — see decision
  // 3 in build-history-ingestion.md step 31 for why votes aren't attributed
  // to the post author.
  const ownerId = await createPlaceholderAuthor({
    source: FORUM_SOURCE,
    externalUsername: payload.author.forum_username,
    displayName: payload.author.display_name,
  })

  const voterIds = await resolveVoterIds((payload.votes ?? []).map((v) => v.voter))

  const votes = (payload.votes ?? []).map((vote) => ({
    user_id: voterIds.get(vote.voter.forum_username)!,
    chosen_label: vote.chosen_label,
    technique_name: vote.technique_name,
    observation: vote.observation ?? null,
    other_description: vote.other_description ?? null,
  }))

  const clipA = detectProvider(payload.clip_a_url)
  const clipB = detectProvider(payload.clip_b_url)

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('ingest_test', {
    payload: {
      source_ref: payload.source_ref,
      owner_id: ownerId,
      title: resolveTestTitle(payload),
      track: payload.track,
      snapshot_a: payload.snapshot_a,
      snapshot_b: payload.snapshot_b,
      clip_a_url: payload.clip_a_url,
      clip_a_provider: clipA.provider,
      clip_a_media_type: clipA.media_type,
      clip_b_url: payload.clip_b_url,
      clip_b_provider: clipB.provider,
      clip_b_media_type: clipB.media_type,
      before_is_a: payload.before_is_a,
      votes,
    },
  })

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Ingest failed' }, { status: 500 })
  }

  const { test_id: testId, already_imported: alreadyImported } = data as {
    test_id: string
    already_imported: boolean
  }

  return NextResponse.json({ testId, alreadyImported }, { status: alreadyImported ? 200 : 201 })
}
