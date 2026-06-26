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
| Framework | Next.js 14, App Router | No Pages Router patterns |
| Language | TypeScript | Strict mode; no `any` without justification |
| Database + Auth | Supabase (Postgres + Supabase Auth) | RLS enforced at DB layer |
| Hosting | Vercel | Vercel Cron for background jobs |
| Styling | Tailwind CSS | Mobile-first; no other CSS frameworks |
| Testing | Vitest + Testing Library | `node` env for logic; `jsdom` for components |

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

`middleware.ts` redirects unauthenticated users from these paths:
```
/systems, /tracks, /profile, /tests/new
```

Public paths (no login required to view, but login required to play/vote):
```
/, /tests/[id], /login, /auth/callback
```

Play/vote auth is enforced in API routes, not in middleware.

---

## 9. Testing conventions

- Pure logic (`lib/**/*.ts`) → `*.test.ts` → Vitest `node` environment
- React components (`components/**/*.tsx`) → `*.test.tsx` → Vitest `jsdom` environment
- Tests live in a `__tests__/` folder adjacent to the file under test
- API routes are tested via integration tests against a Supabase test project (not yet set up — do not add unit tests that mock Supabase internals)

Per-file environment override (add as first line of test file):
```typescript
// @vitest-environment jsdom
```

---

## 10. Build order (for orientation in new sessions)

1. ✅ Supabase schema, RLS, seed data
2. ✅ Auth (Supabase Auth, middleware, magic link, callback)
3. ✅ Clip URL verification (`/api/clips/verify`)
4. ✅ MediaPlayer component (all four cases, A/B coordination)
5. ⬜ Test creation flow
6. ⬜ Test detail page + blind playback
7. ⬜ Voting
8. ⬜ Reveal
9. ⬜ Results by technique
10. ⬜ System catalogue views
11. ⬜ URL health check cron
12. ⬜ Public feed + pagination

Update the checkboxes above as steps are completed.

---

## 11. Reference files

Read `references/schema.md` when working on:
- Any new query involving `clip_mapping`, `votes`, or `system_snapshots`
- Adding or modifying RLS policies
- Writing migrations
- Any feature touching the listening techniques or cross-check logic
