---
name: audiophile-compare
description: >
  Architecture, patterns, and conventions for the audiophile A/B comparison
  web application. Use this skill whenever continuing, extending, or debugging
  this project — including adding new API routes, React components, database
  tables, RLS policies, or any feature described in the build specification.
  Must be consulted before writing any new file in this codebase.
---

# Audiophile Comparison App — Build Skill

This skill keeps implementation consistent across conversations. Read it fully
before writing any code. For the full database schema and RLS policies, read
`audiophile-compare-schema.md` when working on anything data-related.

---

## 1. Technology stack (fixed — do not substitute)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15+, App Router | No Pages Router patterns; use async params/searchParams |
| Language | TypeScript | Strict mode; no `any` without justification; generate types from Supabase |
| Database + Auth | Supabase (Postgres + Supabase Auth) | RLS enforced at DB layer |
| Hosting | Vercel | Vercel Cron for background jobs |
| Styling | Tailwind CSS | Mobile-first; defensive overflow/width patterns required |
| Testing | Vitest + Testing Library | `node` env for logic; `jsdom` for components |

**Next.js 16+ Turbopack Configuration:**

If you have multiple `package-lock.json` files in parent directories (e.g., a monorepo
or Playground folder structure), Next.js may infer the wrong workspace root. Configure
`next.config.mjs` to explicitly set the project root:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(), // Explicitly use current working directory
  },
};

export default nextConfig;
```

Alternatively, remove unused lockfiles from parent directories.

---

## 2. Project file layout

```
app/
  api/                      ← Route Handlers (server only)
    clips/verify/route.ts
    tests/route.ts
    tests/[id]/route.ts
    tests/[id]/reveal/route.ts
    tests/[id]/results/route.ts
    votes/route.ts
    votes/[id]/route.ts
    systems/route.ts
    systems/[id]/snapshots/route.ts
    tracks/route.ts
    techniques/route.ts
  auth/callback/route.ts    ← Magic link exchange
  global-error.tsx          ← Root error boundary (required for Next.js 16 + Turbopack)
  login/page.tsx            ← Server component shell
  tests/[id]/page.tsx       ← Server component: fetches, passes props to client
  tests/new/page.tsx
  systems/page.tsx
  systems/[id]/page.tsx
  tracks/page.tsx
  profile/page.tsx
  page.tsx                  ← Public feed

components/
  media/
    ABPlayer.tsx            ← Client: owns refs, coordinates pause
    MediaPlayer.tsx         ← Client: routes to correct player, forwards pause()
    players/
      NativePlayer.tsx      ← Client: <audio>/<video>
      YouTubePlayer.tsx     ← Client: YouTube iframe SDK
      VimeoPlayer.tsx       ← Client: Vimeo SDK
      UnknownPlayer.tsx     ← Client: fallback link
  LoginForm.tsx             ← Client: magic link form

lib/
  supabase/
    server.ts               ← createClient() for server components + API routes
    client.ts               ← createClient() for browser components
  clips/
    detect-provider.ts      ← Pure URL classification (no I/O)
    check-url.ts            ← HEAD request for direct URLs
  youtube-api.ts            ← Singleton YouTube iframe API loader

types/
  youtube.d.ts              ← YouTube IFrame API type definitions
  database.types.ts         ← Supabase generated types (when added)

middleware.ts               ← Session refresh + route protection (edge runtime)
```

---

## 3. Server vs client components

**Default is server.** Add `'use client'` only when the component needs:
- `useState`, `useReducer`, `useRef`, `useEffect`, `useImperativeHandle`
- Browser event handlers (`onClick`, `onChange`, `onPlay`, etc.)
- Browser APIs (`window`, `document`, `localStorage`)
- Third-party SDKs that require a DOM (YouTube, Vimeo)

**Pattern for pages with data + interactivity:**
- `app/tests/[id]/page.tsx` — server component; queries Supabase; passes data as props
- Interactive child components — client components receiving props

A server component can render a client component. A client component cannot
import server-only code (e.g. `lib/supabase/server.ts`).

**Next.js 15+ async params/searchParams pattern:**
```typescript
// Dynamic route params are now Promises
export default async function TestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const search = await searchParams
  // ...
}
```

**API routes also require awaiting params:**
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

## 4. Supabase client usage

**Server components and API routes — always use the server client:**
```typescript
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
```

**Browser / client components — always use the browser client:**
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()  // not async
```

Never import `lib/supabase/server.ts` inside a `'use client'` file.
Never import `lib/supabase/client.ts` inside a server component or API route.

---

## 5. API route conventions

Every API route lives in `app/api/**/route.ts` and exports named HTTP method
functions. All routes that require authentication follow this exact pattern at
the top of the handler — no exceptions:

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

**Ownership checks** (e.g. reveal a test) query the DB to verify, never trust
a client-supplied user ID:
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

**Never leak sensitive IDs in API responses:**
```typescript
// NEVER return creator_id or other sensitive fields to non-creators
const responseData = {
  ...test,
  creator_id: undefined,  // Strip sensitive fields
}
// OR use explicit field selection:
const { data } = await supabase
  .from('tests')
  .select('id, title, status, created_at')  // Explicit allowlist
```

**Standard response format:**
```typescript
// Success responses
return NextResponse.json({ data: result }, { status: 200 })

// Error responses (use consistent error shape)
return NextResponse.json(
  { error: 'Descriptive message', code: 'ERROR_CODE' },
  { status: 400 | 401 | 403 | 404 | 500 }
)
```

---

## 5a. Programmatic access — two use cases only

There are exactly two non-browser callers anticipated. No general-purpose
public API, no API key management UI, no versioned contract, no OpenAPI
documentation. The design is the minimum needed for these two cases.

---

### Decisions recorded

**Go vs Next.js:** A separate Go service was considered and rejected. Both use
cases are low-frequency and operate on the same data model as the browser. A
Go service would add a second deployment, second secret management, and a
second codebase to keep in sync with the schema — with no performance benefit
at this scale. Go remains an option if sustained high concurrency or
long-running operations become a concrete requirement; extraction would be
mechanical since Supabase is the shared data layer.

**No public API, no versioning, no API keys:** Neither use case is a
third-party integration. A versioned `/api/v1/` surface, OpenAPI
documentation, per-user API keys, and rate limiting infrastructure would all
be overhead with no benefit. Both callers are first-party and controlled.

---

### Use case 1 — Forum ingestion pipeline

An AI process reads Lejonklou forum threads, extracts recordings and listening
comparisons, and writes them into the database as tests, tracks, clips, and
votes. Periodic scheduled refreshes catch new posts.

**Authentication:** A single dedicated `ingestion_bot` user in the `users`
table, created manually. The ingestion service authenticates as this user via
Supabase Auth (magic link issued once; token stored in the service's
environment). No API key table needed.

**Idempotency:** Forum posts must not produce duplicate tests on repeated
runs. Add a `source_ref` column to `tests` to record provenance:

```sql
-- Migration: add_source_ref_to_tests
alter table public.tests add column source_ref text unique;
-- e.g. 'lejonklou-forum:thread-42:post-187'
```

Before inserting a test, check `source_ref` — skip if already present.

**Ingest endpoint:** A single internal route, not part of any public surface:

```
POST /api/internal/ingest
```

Protected by a shared secret in an environment variable — not Supabase Auth —
since this route is called server-to-server, not from a browser:

```typescript
// app/api/internal/ingest/route.ts
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-ingest-secret')
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // ... write track, test, clips, clip_mapping, votes atomically
  // using the ingestion_bot user's supabase client
}
```

`INGEST_SECRET` is set in Vercel environment variables and in the ingestion
service's environment. Never committed to source control.

**Payload shape** (one test per call):
```typescript
type IngestPayload = {
  source_ref: string           // unique identifier for the forum post
  track: {
    artist: string
    title: string
    album?: string
    passage_note?: string
  }
  snapshot_a: {
    system_name: string        // matched or created by name
    version_label: string
    components?: object[]
  }
  snapshot_b: {
    system_name: string
    version_label: string
    components?: object[]
  }
  clip_a_url: string
  clip_b_url: string
  before_is_a: boolean
  votes?: Array<{
    chosen_label: 'A' | 'B'
    technique_name: string     // matched against listening_techniques.name
    observation?: string
    other_description?: string
  }>
}
```

The ingest route resolves or creates tracks, systems, and snapshots by name
before writing the test — the same logic as the web creation flow, but
automated. All writes are attributed to the `ingestion_bot` user.

**CORS:** Not needed — server-to-server call, no browser involved.

---

### Use case 2 — Mobile app (future)

The mobile app is a first-party client. It authenticates users via Supabase
Auth directly (magic link or OAuth), storing tokens in `expo-secure-store`
rather than cookies. It then calls the same `/api/` routes as the browser,
or the Supabase JS client directly for read operations.

**No separate auth mechanism needed.** The mobile app authenticates as the
user, not as "the app". Existing RLS policies and route auth checks apply
unchanged.

**Upload flow** (when owned storage is implemented — see section 15):
```
Mobile → POST /api/clips/upload-url   (authenticated as user; returns presigned URL)
Mobile → PUT  {presignedUrl}          (direct to storage; no server involvement)
Mobile → POST /api/clips/confirm      (marks clip row as uploaded)
```

**CORS:** Needed only if the mobile app calls `/api/` routes directly rather
than via the Supabase JS client. Add to `middleware.ts` if required:
```typescript
if (request.nextUrl.pathname.startsWith('/api/') &&
    request.headers.get('x-client') === 'mobile') {
  // set CORS headers
}
```

In practice, using the Supabase JS client for reads and the existing `/api/`
routes for mutations (with the user's session token) avoids CORS entirely.

---

**Current state:** Neither use case is implemented. The ingestion pipeline
and mobile app are deferred until after the core build steps (1–11) are
complete. The `source_ref` migration should be added to `tests` before the
first production data is written, to avoid a backfill later.

---

## 6. Security rules — must be enforced in every relevant route

These are non-negotiable. RLS enforces them at the DB layer, but API routes
must also enforce them explicitly.

### Rule 1 — clip_mapping is never returned until revealed
```typescript
// NEVER do this for unrevealed tests:
const { data } = await supabase
  .from('clip_mapping')
  .select('*')
  .eq('test_id', testId)

// CORRECT — always check status first:
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

### Rule 2 — vote tallies hidden until user has voted or test is revealed; vote COUNT is always public

There is a deliberate distinction between the **count** and the **tally**:

- **Vote count** (how many distinct listeners have voted): always public, shown to
  everyone including logged-out visitors. Encourages participation. Carries no
  information about which clip is preferred.
- **Vote tally** (breakdown by clip and technique): hidden until the viewer has
  voted or the test is revealed. Prevents anchoring bias.

**Fetching the public count** — always via the `test_vote_count` Postgres
function, never by querying `votes` directly. The function runs as
`security definer` so it can count rows across the RLS boundary without
exposing individual votes or clip choices:

```typescript
// Safe for any viewer including logged-out — returns only an integer
const { data } = await supabase
  .rpc('test_vote_count', { test_id: testId })

const voteCount: number = data ?? 0
```

**Fetching the tally** — still gated, same rule as before:
```typescript
const { count } = await supabase
  .from('votes')
  .select('*', { count: 'exact', head: true })
  .eq('test_id', testId)
  .eq('user_id', user.id)

const canSeeTally = test.status === 'revealed' || (count ?? 0) > 0
```

Never query the `votes` table directly for a public count — that would require
relaxing the RLS policy in ways that could expose individual vote rows.

### Rule 3 — clip playback requires login
Enforced in middleware for protected routes. API routes serving clip data
must also check `user` is not null.

### Rule 4 — only creator can reveal a test
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

---

## 7. MediaPlayer component contracts

### ClipData type (canonical — do not redefine elsewhere)
```typescript
// Defined in components/media/MediaPlayer.tsx — import from there
export type ClipData = {
  id: string
  label: 'A' | 'B'
  source_url: string
  provider: 'youtube' | 'vimeo' | 'direct' | 'unknown'
  media_type: 'audio' | 'video' | 'unknown'
  canonical_url?: string
  embed_id?: string | null
}
```

### PlayerHandle type (canonical — do not redefine elsewhere)
```typescript
// Defined in components/media/players/NativePlayer.tsx — import from there
export type PlayerHandle = {
  pause: () => void
}
```

### ABPlayer is the only public-facing media component
Pages render `<ABPlayer clipA={...} clipB={...} />`. They do not import
`MediaPlayer` or individual player components directly.

### forwardRef + useImperativeHandle pattern
All player components follow this structure — do not deviate:
```typescript
const MyPlayer = forwardRef<PlayerHandle, Props>(function MyPlayer(props, ref) {
  const innerRef = useRef<SomeSDKType | null>(null)

  useImperativeHandle(ref, () => ({
    pause() { innerRef.current?.pause() },
  }))

  useEffect(() => {
    // SDK setup
    return () => { /* cleanup / destroy */ }
  }, [relevantProp])

  return <div ref={containerRef} />
})
```

---

## 8. Middleware — protected routes

**Current implementation:** `middleware.ts` serves two purposes:
1. **Session refresh** — Updates Supabase auth cookies on every request
2. **Route protection** — Redirects unauthenticated users from protected paths

Protected paths (require authentication):
```
/systems, /tracks, /profile, /tests/new
```

Public paths (no login required to view, but login required to play/vote):
```
/, /tests/[id], /login, /auth/callback
```

Play/vote auth is enforced in API routes, not in middleware.

**⚠️ Next.js 16+ Deprecation Warning:**

Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts`. However, Supabase's
`@supabase/ssr` package (as of v0.12.0) requires middleware for session refresh.

**Current status (2026-06):**
- The deprecation warning can be **safely ignored** for now
- `middleware.ts` continues to work in Next.js 16+
- Supabase has not yet published a migration guide for Next.js 16's proxy pattern

**Future migration path (when Supabase publishes guidance):**
1. Session refresh logic will likely move to a new `@supabase/ssr` API compatible with `proxy.ts`
2. Route protection may move to proxy configuration or remain in middleware
3. Monitor Supabase changelog and Next.js 16 migration guides

**Do NOT migrate to `proxy.ts` yet** — wait for official Supabase support.

---

## 9. Testing conventions

- Pure logic (`lib/**/*.ts`) → `*.test.ts` → Vitest `node` environment
- React components (`components/**/*.tsx`) → `*.test.tsx` → Vitest `jsdom` environment
- Tests live in a `__tests__/` folder adjacent to the file under test
- API routes are tested via integration tests against a Supabase test project (not yet set up — do not add unit tests that mock Supabase internals)

**Test environment configuration:**
```typescript
// vitest.config.ts - use jsdom as default for convenience
export default defineConfig({
  test: {
    environment: 'jsdom',  // Default works for components and most code
    // When environmentMatchGlobs is available:
    // environmentMatchGlobs: [
    //   ['lib/**/*.test.ts', 'node'],  // Pure logic doesn't need DOM
    //   ['**/*.test.tsx', 'jsdom'],    // Components need DOM
    // ]
  },
})
```

Per-file environment override (add as first line of test file):
```typescript
// @vitest-environment node  // For pure logic tests
```

---

## 10. Build order (for orientation in new sessions)

1. ✅ Supabase schema, RLS, seed data
2. ✅ Auth (Supabase Auth, middleware, magic link, callback)
3. ✅ Clip URL verification (`/api/clips/verify`)
4. ✅ MediaPlayer component (all four cases, A/B coordination)
5. ✅ Test creation flow
6. ✅ Test detail page + blind playback
7. ✅ Voting
8. ✅ Results by technique
9. ⬜ System catalogue views
10. ⬜ URL health check cron
11. ⬜ Public feed + pagination

Update the checkboxes above as steps are completed.

---

## 11. Mobile responsiveness patterns

All layouts must be mobile-first and prevent horizontal scroll on small screens.

**Required defensive CSS patterns:**
```typescript
// Root layout (app/layout.tsx)
<html className="overflow-x-hidden">
<body className="overflow-x-hidden">

// Page containers
<main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">

// Media embeds (YouTube, Vimeo iframes)
<div className="relative w-full max-w-full aspect-video overflow-hidden">

// Grid layouts that should stack on mobile
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

// Children in flex/grid containers
<div className="min-w-0 w-full max-w-full">
```

**Responsive spacing:**
- Use `sm:` and `lg:` breakpoints for padding, gaps, text sizes
- Example: `py-6 sm:py-10`, `gap-4 sm:gap-6`, `text-xl sm:text-2xl`

**Global styles (app/globals.css):**
```css
* {
  box-sizing: border-box;
}
```

---

## 12. TypeScript type safety

**Supabase type generation (recommended future improvement):**
```bash
npx supabase gen types typescript --project-id <id> > types/database.types.ts
```
Then import and use instead of manual type assertions.

**YouTube IFrame API types:**
Define in `types/youtube.d.ts` to extend Window interface:
```typescript
declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady?: () => void
  }
}

export namespace YT {
  class Player {
    constructor(elementId: string, options: PlayerOptions)
    pauseVideo(): void
    // ... other methods
  }
  // ... other types
}
```

**Avoid fragile type assertions:**
```typescript
// BAD - fragile workaround for Supabase joined relations
const sys = s.systems as { owner_id: string } | { owner_id: string }[]
const ownerId = Array.isArray(sys) ? sys[0]?.owner_id : sys?.owner_id

// BETTER - generate types from schema or create helper utilities
```

---

## 13. Error boundaries and loading states

**Error handling:**

- `app/global-error.tsx` — **Required for Next.js 16 + Turbopack**. Root-level error boundary that catches unhandled errors across the entire application. Must be a client component with its own `<html>` and `<body>` tags:

```tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  )
}
```

**Note:** This file resolves a known Next.js 16.2.x + Turbopack bundling bug where the bundler loses track of built-in error boundary components during development. Without it, you may see: `Error: Could not find the module "global-error.js#default" in the React Client Manifest.`

- `app/error.tsx` — Route segment error boundaries (when needed for specific pages)
- `app/not-found.tsx` — Custom 404 page (future implementation)
- API routes return proper status codes (401, 403, 404, 500)

**Loading states (add when implementing Suspense patterns):**
- `app/loading.tsx` — route segment loading UI
- `app/tests/[id]/loading.tsx` — test detail loading skeleton
- Consider Suspense boundaries for data fetching

---

---

## 15. Future expansion — dedicated storage and mobile recording

This section records architectural decisions for a potential future feature:
owned blob storage for recordings, and a mobile app to make recording and
upload simple. Neither is under active development. No current code needs to
change to keep these options open.

---

### Storage

**Current model:** BYOS — users supply URLs (YouTube, Vimeo, Dropbox, direct
links). The app never handles audio/video bytes.

**Future model:** Owned blob storage where the app accepts and stores
recordings directly.

**Preferred options (in order):**

- **Supabase Storage** — already in the stack; RLS policies mirror the database
  rules; signed URLs for time-limited playback; direct upload from mobile
  without proxying through the server. Lowest operational overhead.
- **Cloudflare R2** — S3-compatible, no egress fees (important for audio/video
  replayed many times), pairs well with Vercel. Use if Supabase Storage proves
  limiting.
- **AWS S3** — standard but egress costs accumulate at scale for media files.
  Avoid unless other AWS services are already in use.

**Schema change needed (one migration, no data migration):**

The `clips` table has a CHECK constraint on `provider`:
```sql
CONSTRAINT clips_provider_check CHECK (provider IN ('youtube', 'vimeo', 'direct', 'unknown'))
```
Add new values when owned storage is introduced:
```sql
ALTER TABLE public.clips
  DROP CONSTRAINT clips_provider_check,
  ADD CONSTRAINT clips_provider_check
    CHECK (provider IN ('youtube', 'vimeo', 'direct', 'unknown', 'supabase', 'r2'));
```

A `storage_key` column should also be added for the internal object path
(separate from the public/signed URL which may rotate):
```sql
ALTER TABLE public.clips ADD COLUMN storage_key text;
```

**Retention policy** must be decided before launch of owned storage — who pays
for indefinitely stored files. Options: retain permanently, archive after N
years, delete when parent test is deleted. Affects whether `archived_at` needs
to be added to `clips`.

---

### Upload flow

For files of any meaningful size, the mobile app uploads directly to storage —
never through the Next.js server. The server generates a pre-signed upload URL
and the app PUTs directly to storage.

```
Mobile → POST /api/v1/clips/upload-url   (authenticated; returns presigned URL + clipId)
Mobile → PUT  {presignedUrl}             (direct to storage; server not involved)
Mobile → POST /api/v1/clips/confirm      (tells server upload is complete)
Server →      updates clip row, optionally enqueues transcode job
```

This flow fits cleanly into the existing agentic API design (section 5a).
The two new endpoints (`upload-url` and `confirm`) are the only additions
needed in the Next.js codebase.

---

### Transcoding

Raw mobile recordings (typically AAC/M4A for audio, MP4 for video) may need
normalisation for consistent cross-device playback. Options:

- **Accept raw and transcode server-side** — better user experience; requires
  a background job queue. Recommended choice: **Inngest** or **Trigger.dev**
  (both integrate with Vercel and support durable job execution beyond the
  5-minute function limit).
- **Require app to transcode before upload** — simpler server; more complex
  app; not recommended for a first version.

Vercel Cron (already planned for URL health checks) is not suitable for
transcoding — jobs may run longer than the cron execution window.

---

### Mobile app

**Technology options:**

| Option | Fit | Notes |
|---|---|---|
| React Native + Expo | Best for speed | TypeScript reuse; Supabase JS client works; Expo AV has recording APIs; cross-platform |
| Swift (iOS only) | Best for audio quality | Native CoreAudio/AVFoundation access; sample-accurate recording; significant language investment |
| Flutter | Middle ground | Cross-platform; Dart approachable from Java/Go background; good Supabase client |

**Recommendation:** React Native + Expo if time-to-working-app is the
priority. Swift if the audiophile community is iOS-dominated and recording
fidelity at the hardware level is central to the value proposition.

**Auth difference from web:** Mobile apps cannot use cookies. Supabase Auth
works via token storage in `expo-secure-store` instead of `@supabase/ssr`.
The agentic API Bearer token pattern (section 5a) applies directly — the
mobile app is an API client using the same `/api/v1/` routes.

---

### What requires no change now

The current BYOS architecture is forward-compatible with all of the above:

- `source_url` is agnostic about where the file lives
- `MediaPlayer` already handles `direct` audio/video URLs — owned storage URLs
  render via the same code path
- The agentic API design already accommodates non-browser callers
- The `provider` CHECK constraint is the only schema change needed, and it is
  additive (no data migration)

No current implementation decisions need revisiting to keep these options open.

Read `audiophile-compare-schema.md` when working on:
- Any new query involving `clip_mapping`, `votes`, or `system_snapshots`
- Adding or modifying RLS policies
- Writing migrations
- Any feature touching the listening techniques or cross-check logic

---

## 16. Listening technique governance and results display

### Three tiers

| Tier | Name | Behaviour |
|---|---|---|
| 1 | Curated | Named techniques seeded at launch. Stable IDs. Results are cross-test comparable. Admin-managed only. |
| 2 | Other | Single row (`is_other = true`). Requires free-text description. Excluded from technique-level aggregation. Shown as qualitative list in results. |
| 3 | Proposed | Deferred to v2. Recurrent "Other" descriptions may be nominated for promotion to Tier 1. |

### Results display logic

- **Curated techniques** (`is_other = false`): shown as percentage bars, grouped by technique, with vote count
- **Other votes**: shown as a separate qualitative section — each voter's description and preference listed individually
- **Divergence detection**: when curated techniques disagree on winner, surface a note to the viewer, e.g.:
  > "Timing-focused listeners preferred B; tonal listeners preferred A — this change may involve a tradeoff."

---

## 17. System catalogue views (build step 9)

Three navigation views support cross-time comparison.

### View 1 — By track
"Show me all tests that used this passage."
- User selects a track; app returns all tests referencing it, ordered by date
- Displays which snapshots were compared in each test
- Enables "go back in time" — the full history of how a track sounded across configurations

### View 2 — By snapshot
"Show me everything tested at this system configuration."
- User selects a snapshot; app returns all tests where it appeared as either side A or side B
- Shows win/loss record for that snapshot across all tests

### View 3 — Cross-check (anti-local-maxima feature)
"Compare any two snapshots directly."
- User selects Snapshot A and Snapshot B (regardless of when they were created)
- App finds tracks that appear in tests for both snapshots
- If matching clips exist, a new test can be created from existing clip URLs — no new recording needed
- This directly addresses the risk of successive "locally good" decisions leading to a globally suboptimal system configuration

---

## 18. Developer context

These notes inform how explanations should be framed and how code should be written.

### Background
- **SQL:** Expert — complex queries, JOINs, indexes, migrations, stored procedures
- **HTTP / REST:** Experienced — request/response cycle, headers, status codes, API design
- **Back-end:** .NET, Java, Go — strong server-side instincts (middleware, dependency injection, connection pooling, background jobs)
- **HTML:** Familiar — comfortable reading and writing markup
- **JavaScript / TypeScript:** Beginner — understands basics but needs guidance on idioms, patterns, and tooling
- **React / Next.js:** No prior experience — starting fresh

### Working style preferences
- Explain JS/TS patterns and React/Next.js conventions — do not assume familiarity
- Use SQL analogies where helpful (e.g. RLS policies are like row-filtered views with a `WHERE` clause based on the current user)
- HTTP and API route design explanations can be concise
- Prefer explicit and readable code over clever and terse — the developer will be reading and maintaining it
- When there are multiple ways to do something, briefly describe the options and recommend one with a reason
