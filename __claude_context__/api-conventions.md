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

**A clean example of this rule applied from the start (step 45):**
`PATCH /api/profile/technique-preferences` does a delete-then-insert
against `user_technique_preferences`, both covered by one
`for all using (user_id = auth.uid())` policy — no `security definer`
RPC needed, since (unlike `ingest_test`/`claim_placeholder`/
`erase_user_*`) this route only ever touches the caller's own rows.

**A policy's own name can be misleading — check the actual SQL (step
46):** `"tests: creator update (reveal only)"` sounds column-restricted,
but its definition is just `for update using (creator_id = auth.uid())`
— no `with check`, no column-level grant. Postgres RLS has no per-column
enforcement mechanism at all; the `(reveal only)` in the name is
descriptive of what happened to use the policy first, not an enforced
constraint. This meant `PATCH /api/tests/[id]`'s new `forum_link` column
(step 46) needed zero RLS changes — the creator could already update any
column on their own row. Don't assume a policy is narrower than its own
`using`/`with check` clauses without reading them.

### Rule 6 — delete rules (step 26)

- `DELETE /api/tests/[id]` — creator only; 409 if the test has any vote.
- `DELETE /api/systems/[id]/snapshots/[snapshotId]` — system-owner only; 409
  if any test still references this snapshot (`snapshot_a_id`/`snapshot_b_id`).
- `DELETE /api/systems/[id]` — owner only; 409 if the system has any snapshot.

All three are hard deletes — no `deleted_at` column, no restore/undo. See
`audiophile-compare-schema.md`'s "Delete rules" section for the full
cascade/RESTRICT design.

**Not absolute — step 38 adds a separate, more privileged exception.**
`POST /api/admin/erase-user-data` (admin-only, human-verified — see Rule 8)
can delete a voted-on test, and a user's votes on any test, via
`erase_user_content`/`erase_user_votes`. This is a distinct, deliberately
separate path — it doesn't change `DELETE /api/tests/[id]`'s own behavior,
which still refuses a voted-on test exactly as before for any normal,
self-service caller.

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

### Rule 8 — admin-gated routes/pages (step 39's `/version` precedent, extended by step 38)

Session + `isAdminEmail(user.email)` (`lib/admin/is-admin-email.ts`,
checks the `ADMIN_EMAILS` env var) — not `INGEST_SECRET`, not a DB role.
A human, browser-driven action from the site owner's own logged-in
session, distinct from the forum-ingestion pipeline's server-to-server
callers below.

```typescript
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login?redirectTo=...')          // page — safety net, middleware already covers this
// or: return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })  // route

if (!isAdminEmail(user.email)) notFound()              // page — 404, not 403: don't confirm
// or: return NextResponse.json({ error: 'Not found' }, { status: 404 })     // route — this route exists to a non-admin
```

Three real callers: `app/version/page.tsx` (read-only deployment info),
`app/admin/erase-user-data/page.tsx` / `app/api/admin/erase-user-data/
route.ts` (step 38 — calls `erase_user_votes`/`erase_user_content`/
`erase_user_account` via the admin client, then `admin.auth.admin.
deleteUser()` for a full account erasure), and `app/admin/claim/
page.tsx` / `app/api/admin/claim/route.ts` (step 39 — calls
`claim_placeholder` via the admin client, then `admin.auth.admin.
deleteUser()` for the now-merged placeholder identity).

### Rule 9 — system/snapshot identity is never disclosed until revealed (step 43)

Which systems/components are under comparison must not be disclosed until
a test is revealed or the viewer is its creator — page-level, like Rule 3,
not just an `app/api/` route rule.

```typescript
const canSeeSystemInfo =
  test?.status === 'revealed' || test?.creator_id === user?.id

if (!canSeeSystemInfo) {
  // Redact snapshot_a/snapshot_b before render; for list pages, redact
  // per-row after the shared query rather than a query-level filter,
  // since other row fields must still render regardless of entitlement.
}
```

Deliberately **not** `|| hasVoted`, unlike Rule 2's `canSeeTally` — a
voter who hasn't yet had the test revealed still shouldn't learn which
systems were compared just because they voted. Ingested test titles no
longer bake the system name in either (`resolveTestTitle`'s fallback
reverted from step 40 Part B) — there's no reliable way to disclose it
only once revealed since the title is fixed once at ingest time. See
`components.md §8` for the three different implementation mechanisms
across the three affected pages, and
`build-history/43-hide-blind-test-system-info.md` for the full design.

**A second field gated by the same `canSeeSystemInfo` boolean, added in
step 46: `tests.forum_link`** — a creator-supplied link to a forum thread
discussing the test, hidden from non-creators until revealed. Reuses
`isRevealed || isCreator` directly rather than a second, separately-computed
boolean, since the rule is identical. **Not to be confused with
`tests.source_url`** (a different column, different purpose, deliberately
shown *unconditionally* — see `audiophile-compare-schema.md`'s
`` `forum_link` vs `source_url` `` note for the full distinction and why
they aren't the same field). Editable any time via `PATCH
/api/tests/[id]`, creator-only, no reveal or vote-count gating — unlike
`PATCH /api/clips/[id]`'s `voteCount === 0` restriction, a forum link is
pure metadata, not what's being tested, so editing it after votes or
after reveal doesn't retroactively misrepresent anything a listener heard.

---

## 5. Programmatic access

There are exactly two non-browser callers. No public API, no versioned contract, no API keys, no OpenAPI documentation.

### Forum ingestion pipeline

Implemented (`build-history/31-ingestion-internal-ingest-route.md`; full design in `build-history-ingestion/31-internal-ingest-api-route.md`). Not a single bot user — each forum post author, and separately each voter/commenter, resolves or creates its own placeholder identity (`lib/ingestion/create-placeholder-author.ts`, step 30). Writes run through the admin/service-role client, which bypasses RLS entirely — there is no per-request user session to check RLS against.

- **Route:** `POST /api/internal/ingest` — protected by an `x-ingest-secret` request header checked against the `INGEST_SECRET` env var (not Supabase Auth, since this is a server-to-server call). See `docs/vercel-setup.md` for provisioning `INGEST_SECRET` per environment.
- **Payload validation:** `lib/ingestion/ingest-test-payload.ts` (`validateIngestPayload`) — see that file or `build-history-ingestion/31-internal-ingest-api-route.md` for the full `IngestPayload` shape, including the per-vote `voter` field, the optional `source_url` (step 32 — populates `tests.source_url`, used by the "view original post" link in the import-provenance UI), and the optional `created_at` (step 36 finding 8 — the real forum post date; falls back to ingestion time when absent, same as a web-created test).
- **Idempotency:** via `tests.source_ref` (UNIQUE, nullable) — checked first inside the `ingest_test` Postgres function; a repeat call with the same `source_ref` returns the existing test id with `alreadyImported: true` rather than erroring. Example value: `'lejonklou-forum:thread-42:post-187'`.
- **Reveal state:** `ingest_test` sets `status`/`revealed_at` from whether the payload's `votes` array is non-empty — `'revealed'` (with `revealed_at = now()`) if so, `'open'` otherwise (step 36 finding 8; before this, every import was silently left `'open'` regardless of votes, which both hid the before/after mapping and tally from visitors and left a historical test open to a fresh vote today).
- **Atomicity:** the track/system/snapshot/test/clips/clip_mapping/votes writes run inside a single `public.ingest_test(payload jsonb)` Postgres function called via `.rpc()`, so a single test's worth of data either fully succeeds or fully rolls back. Placeholder author creation happens beforehand in application code (an admin-SDK call, which can't run inside a SQL function) and is separately idempotent.
- **Security:** `ingest_test` is `security definer` and bypasses RLS, so EXECUTE is explicitly revoked from `anon`/`authenticated`/`public` and granted only to `service_role` in its migration — otherwise anyone with the anon key could call it directly via `POST /rest/v1/rpc/ingest_test`, bypassing both RLS and the route's `INGEST_SECRET` check.
- **Clip verification is not this route's job** — it trusts that clip health was already confirmed upstream, by step 35's extraction, before a candidate was marked ready to commit (step 36 is the one actually calling this route, but does no validation of its own). It does run `detectProvider()` (no network request) to populate `provider`/`media_type` on each clip.
- **Only caller:** `scripts/commit-lejonklou.ts` / `lib/ingestion/commit.ts` (step 36). Enforces "staging first" at the tooling level, not just as a documented convention — a `--env production` run reads its input from `ingested/staging/`, never `approved/`, so a candidate physically cannot reach production without already having been committed to staging. Uses two separate local env vars, `INGEST_SECRET_STAGING`/`INGEST_SECRET_PRODUCTION` (see `docs/vercel-setup.md`), not a single ambient `INGEST_SECRET`, so the same session can commit to staging then production without editing `.env.local` in between.
- **Undo path (ingestion-pipeline iteration only, not a general user-data mechanism):** `scripts/rollback-lejonklou.ts` / `lib/ingestion/rollback.ts` (built during step 36's iteration — not this route; it talks to the database directly via the admin client, bypassing this route entirely, same as `ingest_test` itself does). Has no placeholder-ownership check, so it's not safe against production now that step 39's claim flow exists — see `build-history-ingestion/36-commit.md` findings 8–9 and `docs/vercel-setup.md`'s rollback-script env var section. For an actual user's removal request (votes/content/full-data erasure), see `build-history-ingestion/38-data-erasure-requests.md` — a separate, admin-only mechanism, not this script.

### Mobile app (future)

Authenticates as the end user via Supabase Auth. Tokens stored in `expo-secure-store` instead of cookies. Calls the same `/api/` routes as the browser — no separate auth mechanism needed.

Not yet implemented. CORS headers may be needed in `middleware.ts` if the mobile app calls `/api/` routes directly rather than via the Supabase JS client.
