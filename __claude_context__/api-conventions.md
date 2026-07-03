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

### Rule 3 — clip playback requires login

Enforced in middleware for protected routes. API routes serving clip data must also check that `user` is not null.

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

When a route performs both `INSERT` and `UPDATE` on a table, both operations must have explicit RLS policies. A missing `UPDATE` policy causes the Supabase client to return an error object even when application-level ownership checks pass — the route sees `error` truthy and returns 500. Always audit schema migrations when a write route returns 500 unexpectedly.

Example: `system_snapshots` requires two write policies:
- `snapshots: owner insert` — for `POST /api/systems/[id]/snapshots`
- `snapshots: owner update` — for `PATCH /api/systems/[id]/snapshots/[snapshotId]`

---

## 5. Programmatic access

There are exactly two non-browser callers. No public API, no versioned contract, no API keys, no OpenAPI documentation.

### Forum ingestion pipeline

Authenticates as a dedicated `ingestion_bot` user created manually in `auth.users`. Subject to standard RLS — no policy exceptions needed.

- Idempotency via `tests.source_ref` (UNIQUE, nullable). Before inserting a test, check `source_ref` — skip if already present. Example value: `'lejonklou-forum:thread-42:post-187'`.
- Internal route: `POST /api/internal/ingest` — protected by `INGEST_SECRET` request header (an env var, not Supabase Auth, since this is a server-to-server call).

Not yet implemented. `source_ref` is already in the schema.

### Mobile app (future)

Authenticates as the end user via Supabase Auth. Tokens stored in `expo-secure-store` instead of cookies. Calls the same `/api/` routes as the browser — no separate auth mechanism needed.

Not yet implemented. CORS headers may be needed in `middleware.ts` if the mobile app calls `/api/` routes directly rather than via the Supabase JS client.
