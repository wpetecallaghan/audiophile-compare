---
name: audiophile-compare-api
description: >
  API route conventions, Supabase client selection, security rules, standard
  response format, and programmatic access patterns for the audiophile A/B
  comparison app. Load this when writing or modifying any file in app/api/.
  Also load audiophile-compare-schema.md for the data model.
---

# Audiophile Compare — API Conventions

Also load `audiophile-compare-schema.md` for the data model when working on routes.

---

## 1. Supabase client selection

**Server components and API routes — always use the server client:**
```typescript
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()   // async
const { data: { user } } = await supabase.auth.getUser()
```

**Browser / client components — always use the browser client:**
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()         // not async
```

**Cron routes and admin-only operations — use the admin client:**
```typescript
import { createAdminClient } from '@/lib/supabase/admin'

const supabase = createAdminClient()    // bypasses RLS — no user session
```

`SUPABASE_SERVICE_ROLE_KEY` must be set in `.env.local` and Vercel env vars.
Never import `lib/supabase/admin.ts` from any `'use client'` file or code that can reach the browser.

---

## 2. Auth check — required at the top of every authenticated route

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ... handler logic
}
```

**Ownership check — always query the DB; never trust a client-supplied user ID:**
```typescript
const { data: test } = await supabase
  .from('tests')
  .select('creator_id')
  .eq('id', testId)
  .single()

if (!test || test.creator_id !== user.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

**Async params — Next.js 15+ pattern:**
```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ...
}
```

---

## 3. Standard response format

```typescript
// Success — named field matching the resource, not a generic 'data' wrapper
return NextResponse.json({ snapshot }, { status: 201 })  // POST — created
return NextResponse.json({ snapshot }, { status: 200 })  // PATCH — updated
return NextResponse.json({ tests },    { status: 200 })  // GET — list

// Error — consistent shape; no 'code' field used in this project
return NextResponse.json({ error: 'Descriptive message' }, { status: 400 })
// Status codes: 400 | 401 | 403 | 404 | 500
```

**Never leak sensitive fields — use explicit column selection:**
```typescript
// ✅ explicit allowlist
const { data } = await supabase
  .from('tests')
  .select('id, title, status, created_at')

// ❌ never return creator_id or other sensitive fields to non-creators
```

---

## 4. Security rules — enforce in every relevant route

### Rule 1 — clip_mapping is never returned until revealed

```typescript
const { data: test } = await supabase
  .from('tests')
  .select('status, creator_id')
  .eq('id', testId)
  .single()

const canSeeMapping =
  test?.status === 'revealed' || test?.creator_id === user?.id

if (!canSeeMapping) {
  // Do not include clip_mapping in response
}
```

### Rule 2 — vote count vs vote tally (important distinction)

- **Vote count** (number of distinct listeners who have voted): **always public**. Use the `test_vote_count` RPC — never query `votes` directly.
- **Vote tally** (breakdown by clip and technique): **gated** — hidden until the viewer has voted or the test is revealed.

```typescript
// Safe for any viewer including logged-out:
const { data } = await supabase.rpc('test_vote_count', { test_id: testId })
const voteCount: number = data ?? 0

// Gated tally — check if viewer has voted first:
const { count } = await supabase
  .from('votes')
  .select('*', { count: 'exact', head: true })
  .eq('test_id', testId)
  .eq('user_id', user.id)

const canSeeTally = test.status === 'revealed' || (count ?? 0) > 0
```

Never query `votes` directly for a public count — RLS restricts vote rows to own votes or revealed tests, so a direct count returns 0 or an error for most callers.

### Rule 3 — clip playback is public; voting requires login

`clips`/`tests` SELECT RLS policies are `using (true)` — clip data is
public read, same as the rest of the test detail page. There is no auth
check anywhere in the playback path (no middleware, no API-route check) —
`app/tests/[id]/page.tsx` renders `ABPlayer` unconditionally. Only casting
a vote (`VoteForm`, `POST /api/votes`) requires `user` to be non-null.

### Rule 4 — only the creator can reveal a test

```typescript
// In POST /api/tests/[id]/reveal:
if (test.creator_id !== user.id) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
await supabase
  .from('tests')
  .update({ status: 'revealed', revealed_at: new Date().toISOString() })
  .eq('id', testId)
```

### Rule 5 — audit RLS policies when a route writes to a table

When a route performs `INSERT`, `UPDATE`, or `DELETE` on a table, that operation must have an explicit RLS policy. A missing policy causes the Supabase client to return an error object (or silently affect zero rows) even when application-level ownership checks pass. Always audit schema migrations when a write route returns 500 unexpectedly, or when a `DELETE` reports success but the row is still there.

Example: `system_snapshots` requires three write policies:
- `snapshots: owner insert` — for `POST /api/systems/[id]/snapshots`
- `snapshots: owner update` — for `PATCH /api/systems/[id]/snapshots/[snapshotId]`
- `snapshots: owner delete` — for `DELETE /api/systems/[id]/snapshots/[snapshotId]`

**This bit step 26 for real:** `tests`, `clips`, and `clip_mapping` only had
select/insert/update policies before that step — no delete policy at all.
`ON DELETE CASCADE` on `clips.test_id`/`clip_mapping.test_id` doesn't bypass
RLS either — a cascaded delete triggered by deleting the parent `tests` row
is still subject to RLS for the acting role, so both tables needed their own
`… : test creator delete` policy for the cascade to actually go through.

**And it bit step 27 harder — a worse variant of the same class of bug:**
`clips: test creator update` was in the initial schema migration *file*,
but missing from the live database when actually queried via `pg_policies`
(cause unknown, pre-dates step 27 — nothing before it ever ran `UPDATE` on
`clips`, so the gap was silent for weeks). `PATCH /api/clips/[id]`
(replacing a dead clip's URL) returned `200 { ok: true }` while RLS quietly
updated zero rows — no error, no signal anything was wrong, just a lie.
Fixed two ways: recreated the policy
(`20260707093703_restore_clips_update_policy.sql`), and hardened the route
itself to chain `.select().single()` after every mutating query and treat
a missing row as failure — **never trust an absent `error` to mean a row
actually changed; check what you asked to change is actually returned.**

### Rule 6 — delete rules (step 26)

- `DELETE /api/tests/[id]` — creator only; 409 if the test has any vote.
- `DELETE /api/systems/[id]/snapshots/[snapshotId]` — system-owner only; 409
  if any test still references this snapshot (`snapshot_a_id`/`snapshot_b_id`).
- `DELETE /api/systems/[id]` — owner only; 409 if the system has any snapshot.

All three are hard deletes — no `deleted_at` column, no restore/undo. See
`audiophile-compare-schema.md`'s "Delete rules" section for the full
cascade/RESTRICT design.

### Rule 7 — clip health rules (step 27)

- `POST /api/votes` re-checks every chosen clip's `url_status` and returns
  409 if any is `dead` — defense in depth behind the UI, which already
  hides the vote form when `hasDeadClip` is true. `degraded` never blocks
  voting (may be transient).
- `PATCH /api/clips/[id]` — creator only (via the clip's parent test); 409
  if the test has any vote. Trusts the client-supplied verified fields
  (`source_url`/`provider`/`media_type`/`url_status`) the same way
  `POST /api/tests` already does — the client already called
  `POST /api/clips/verify` moments earlier — rather than re-verifying
  server-side.

See `audiophile-compare-schema.md`'s "Clip health rules" section for the
full design, including the missing-RLS-policy incident above.

---

## 5. Programmatic access

There are exactly two non-browser callers. No public API, no versioned contract, no API keys, no OpenAPI documentation.

### Forum ingestion pipeline

Implemented (`build-history.md` step 31; full design in `build-history-ingestion.md`). Not a single bot user — each forum post author, and separately each voter/commenter, resolves or creates its own placeholder identity (`lib/ingestion/create-placeholder-author.ts`, step 30). Writes run through the admin/service-role client, which bypasses RLS entirely — there is no per-request user session to check RLS against.

- **Route:** `POST /api/internal/ingest` — protected by an `x-ingest-secret` request header checked against the `INGEST_SECRET` env var (not Supabase Auth, since this is a server-to-server call). See `docs/vercel-setup.md` for provisioning `INGEST_SECRET` per environment.
- **Payload validation:** `lib/ingestion/ingest-test-payload.ts` (`validateIngestPayload`) — see that file or `build-history-ingestion.md` step 31 for the full `IngestPayload` shape, including the per-vote `voter` field and the optional `source_url` (step 32 — populates `tests.source_url`, used by the "view original post" link in the import-provenance UI).
- **Idempotency:** via `tests.source_ref` (UNIQUE, nullable) — checked first inside the `ingest_test` Postgres function; a repeat call with the same `source_ref` returns the existing test id with `alreadyImported: true` rather than erroring. Example value: `'lejonklou-forum:thread-42:post-187'`.
- **Atomicity:** the track/system/snapshot/test/clips/clip_mapping/votes writes run inside a single `public.ingest_test(payload jsonb)` Postgres function called via `.rpc()`, so a single test's worth of data either fully succeeds or fully rolls back. Placeholder author creation happens beforehand in application code (an admin-SDK call, which can't run inside a SQL function) and is separately idempotent.
- **Security:** `ingest_test` is `security definer` and bypasses RLS, so EXECUTE is explicitly revoked from `anon`/`authenticated`/`public` and granted only to `service_role` in its migration — otherwise anyone with the anon key could call it directly via `POST /rest/v1/rpc/ingest_test`, bypassing both RLS and the route's `INGEST_SECRET` check.
- **Clip verification is not this route's job** — it trusts that clip health was already confirmed upstream, by step 34's extraction, before a candidate was marked ready to commit (step 35 is the one actually calling this route, but does no validation of its own). It does run `detectProvider()` (no network request) to populate `provider`/`media_type` on each clip.

### Mobile app (future)

Authenticates as the end user via Supabase Auth. Tokens stored in `expo-secure-store` instead of cookies. Calls the same `/api/` routes as the browser — no separate auth mechanism needed.

Not yet implemented. CORS headers may be needed in `middleware.ts` if the mobile app calls `/api/` routes directly rather than via the Supabase JS client.
