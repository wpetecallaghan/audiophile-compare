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
`references/schema.md` when working on anything data-related.

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

## 5a. API-first architecture for programmatic access

**Current state:** The API currently serves the Next.js web frontend exclusively,
using session cookie authentication. All routes expect `supabase.auth.getUser()`
to extract the user from the session cookie.

**Future consideration:** To support programmatic/agentic access (AI agents,
CLI tools, external integrations), the API would need:

### Dual authentication strategy
```typescript
// lib/auth/get-user.ts — unified auth for both web and API clients
export async function authenticateRequest(request: NextRequest) {
  // 1. Check for Authorization header (programmatic access)
  const authHeader = request.headers.get('authorization')
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    // Validate API key or JWT token
    // Return user object or null
  }
  
  // 2. Fall back to session cookie (browser access)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
```

### API versioning (when programmatic access is added)
```
app/api/
  v1/                       ← Versioned public API for programmatic access
    tests/route.ts
    tests/[id]/route.ts
    votes/route.ts
  internal/                 ← Web app internal endpoints (not documented)
    clips/verify/route.ts
```

**Pattern:** Public-facing endpoints go in `/api/v1/`. Internal endpoints used
only by the Next.js frontend can remain at `/api/`. This separation allows:
- Independent versioning of the public API
- Breaking changes to internal endpoints without affecting external clients
- Clear documentation boundary (only document `/api/v1/`)

### API documentation (when exposing public API)
- Use OpenAPI 3.x specification
- Generate from TypeScript types where possible
- Host Swagger UI at `/api/v1/docs`
- Include authentication examples for both session and bearer token

### CORS configuration (when supporting non-browser clients)
```typescript
// middleware.ts additions for programmatic access
if (request.nextUrl.pathname.startsWith('/api/v1/')) {
  const response = NextResponse.next()
  response.headers.set('Access-Control-Allow-Origin', '*')  // Or specific domains
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE')
  response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  return response
}
```

### Rate limiting (future consideration)
- Implement per-user or per-API-key rate limits
- Different tiers for web vs programmatic access
- Return `X-RateLimit-*` headers

**Decision:** These patterns are NOT currently implemented. The API is
web-frontend-focused for build phases 1-12. Add programmatic access support
only when external integrations or agent access become a requirement.

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

### Rule 2 — vote tallies hidden until user has voted or test is revealed
```typescript
// Before returning tallies, check one of:
// (a) test.status === 'revealed'
// (b) user has at least one vote on this test
const { count } = await supabase
  .from('votes')
  .select('*', { count: 'exact', head: true })
  .eq('test_id', testId)
  .eq('user_id', user.id)

const canSeeTally = test.status === 'revealed' || (count ?? 0) > 0
```

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
7. ⬜ Voting
8. ⬜ Reveal
9. ⬜ Results by technique
10. ⬜ System catalogue views
11. ⬜ URL health check cron
12. ⬜ Public feed + pagination

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

**Error handling (add when implementing error boundaries):**
- `app/error.tsx` — catches errors in route segments
- `app/not-found.tsx` — custom 404 page
- API routes return proper status codes (401, 403, 404, 500)

**Loading states (add when implementing Suspense patterns):**
- `app/loading.tsx` — route segment loading UI
- `app/tests/[id]/loading.tsx` — test detail loading skeleton
- Consider Suspense boundaries for data fetching

---

## 14. Reference files

Read `audiophile-compare-schema.md` when working on:
- Any new query involving `clip_mapping`, `votes`, or `system_snapshots`
- Adding or modifying RLS policies
- Writing migrations
- Any feature touching the listening techniques or cross-check logic
