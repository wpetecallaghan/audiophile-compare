---
name: audiophile-compare-components
description: >
  Component and page patterns for the audiophile A/B comparison app: server/client
  rules, Next.js 15+ async params, MediaPlayer contracts, wizard and inline-creation
  state management, mobile responsiveness, TypeScript safety, and error boundaries.
  Load this when writing or modifying any component, page, or layout file.
---

# Audiophile Compare — Component Patterns

---

## 1. When to add 'use client'

Default is **server**. Add `'use client'` only when the component needs:
- `useState`, `useReducer`, `useRef`, `useEffect`, `useImperativeHandle`
- Browser event handlers (`onClick`, `onChange`, `onPlay`, etc.)
- Browser APIs (`window`, `document`, `localStorage`)
- Third-party SDKs that require a DOM (YouTube, Vimeo SDKs)

**Pattern for pages with data and interactivity:**
```typescript
// app/tests/[id]/page.tsx — server component
export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('tests').select('...').eq('id', id).single()
  return <VoteForm test={data} />   // VoteForm is 'use client'
}
```

---

## 2. Next.js 15+ async params / searchParams

Dynamic route params and searchParams are Promises in Next.js 15+. Always `await` them.

```typescript
// Pages
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const search = await searchParams
}
```

---

## 3. Hydration warnings

`'use client'` components are SSR'd on the server then hydrated in the browser.
Methods that produce locale- or timezone-dependent output (e.g. `toLocaleDateString()`)
can produce different strings in Node.js vs the browser, causing React hydration warnings.
Suppress on the element:

```tsx
{/* suppressHydrationWarning: toLocaleDateString() may differ between Node.js and browser */}
<p className="text-xs text-gray-400" suppressHydrationWarning>
  {new Date(createdAt).toLocaleDateString()}
</p>
```

---

## 4. Navigation after auth state changes

After client-side auth events (password sign-in, sign-out), use `window.location.href` —
not `router.push`. `SiteHeader` is a server component cached in the RSC payload;
`router.push` may serve stale layout before `router.refresh()` completes.

```typescript
// ✅ correct — full browser navigation; clears RSC cache; guaranteed fresh server render
window.location.href = redirectTo ?? '/'

// ❌ wrong — router may serve stale layout from cache
router.refresh()
router.push(redirectTo ?? '/')
```

Magic link and OAuth callbacks perform a server-side redirect — not affected by this rule.

---

## 5. MediaPlayer contracts

### `ClipData` type — canonical definition in `components/media/MediaPlayer.tsx`
```typescript
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

### `PlayerHandle` type — canonical definition in `components/media/players/NativePlayer.tsx`
```typescript
export type PlayerHandle = {
  pause: () => void
}
```

**Rules:**
- Pages always render `<ABPlayer clipA={...} clipB={...} />`. Never import `MediaPlayer` or individual player components directly from a page.
- All player components use `forwardRef` + `useImperativeHandle`. Do not deviate from this structure:

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

## 6. Wizard and inline-creation patterns

### `CreateTestForm` — local state for inline creations

`systems` is fetched server-side and passed as a prop, then immediately copied to `useState`
so inline snapshot/system creations update the wizard UI without a page reload.
Wizard steps do **not** call `router.refresh()`.

```typescript
export default function CreateTestForm({ systems: initialSystems }: Props) {
  const [systems, setSystems] = useState<SystemWithSnapshots[]>(initialSystems)

  function handleSnapshotCreated(systemId: string, snap: Snapshot) {
    setSystems(prev => prev.map(sys =>
      sys.id === systemId
        ? {
            ...sys,
            system_snapshots: [...sys.system_snapshots, snap]
              .sort((a, b) => b.version - a.version),
          }
        : sys
    ))
  }
}
```

Steps receive callback props:
```typescript
onSnapshotCreated: (systemId: string, snapshot: Snapshot) => void
onSystemCreated:  (system: SystemWithSnapshots) => void
```

After a successful inline creation, the step: (1) calls the callback so `CreateTestForm`
merges the new resource into local state, (2) auto-selects the new resource.

### `AddSnapshotForm` — contrast with wizard

`AddSnapshotForm` is a standalone client component on the system detail page (a server page).
After a successful POST it calls `router.refresh()` — this triggers a server re-fetch and
re-render, causing the new snapshot to appear without full navigation.
Ownership is checked server-side; `isOwner` is computed in the server page and passed as a prop.

**Key differences from wizard steps:**

| | Wizard (`StepSnapshots`) | System detail (`AddSnapshotForm`) |
|---|---|---|
| After creation | call `onSnapshotCreated` callback | call `router.refresh()` |
| Parent | client component (`CreateTestForm`) | server component (page) |
| Ownership | irrelevant (creator is creating the test) | checked server-side |

### `SnapshotSection` — client component with server-rendered children

`SnapshotSection` needs `useState` for the edit-mode toggle, but the tests history list
is complex server-rendered JSX. The server page passes it as `children`:

```tsx
// Server page:
<SnapshotSection
  systemId={id}
  snapshot={{ id, version, label, notes, components, created_at }}
  wins={wins} losses={losses} draws={draws}
  isOwner={isOwner}
>
  <ul>...</ul>   {/* server-rendered tests history; passed through unchanged */}
</SnapshotSection>
```

`SnapshotSection` renders `{children}` in display mode. Edit mode shows an inline form.
On save: `PATCH /api/systems/[id]/snapshots/[snapshotId]`, then `router.refresh()`.
Display mode always reads from props (not local state) so the new server values flow in
correctly after `router.refresh()`.

---

## 7. Mobile responsiveness — required defensive patterns

Every layout must prevent horizontal scroll on small screens.

```typescript
// Root layout (app/layout.tsx)
<html className="overflow-x-hidden">
<body className="overflow-x-hidden">

// Page containers
<main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">

// Media embeds (YouTube, Vimeo iframes)
<div className="relative w-full max-w-full aspect-video overflow-hidden">

// Grids that should stack on mobile
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">

// Children in flex/grid containers
<div className="min-w-0 w-full max-w-full">
```

Use `sm:` and `lg:` breakpoints for padding, gaps, and text sizes:
`py-6 sm:py-10` · `gap-4 sm:gap-6` · `text-xl sm:text-2xl`

Global styles (`app/globals.css`):
```css
* {
  box-sizing: border-box;
}
```

---

## 8. TypeScript — avoid fragile Supabase join assertions

```typescript
// BAD — fragile array/object ambiguity workaround for Supabase joined relations
const sys = s.systems as { owner_id: string } | { owner_id: string }[]
const ownerId = Array.isArray(sys) ? sys[0]?.owner_id : sys?.owner_id

// BETTER — generate types from the schema
// npx supabase gen types typescript --project-id <id> > types/database.types.ts
```

YouTube IFrame API types are declared in `types/youtube.d.ts` (extends the `Window` interface).
`next-intl` message types are extended in `types/next-intl.d.ts` — unknown i18n keys are TypeScript errors.

---

## 9. Error boundaries

**`app/global-error.tsx` is required** for Next.js 16 + Turbopack. Without it the bundler
loses track of built-in error boundary components during development, causing:
`Error: Could not find the module "global-error.js#default" in the React Client Manifest.`

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

---

## 10. i18n — adding UI strings

All user-facing strings live in `messages/en.json`, namespaced by feature area.
**Never hardcode strings directly in components** — always add them to `en.json` first.

**Namespaces:** `common`, `nav`, `auth`, `systems`, `snapshots`, `tests`, `profile`, `feed`, `tracks`, `crosscheck`

**Server components** (async — no bundle cost):
```typescript
import { getTranslations } from 'next-intl/server'

const t = await getTranslations('systems')
return <h1>{t('pageTitle')}</h1>
```

**Client components:**
```typescript
import { useTranslations } from 'next-intl'

const t = useTranslations('systems')
return <button>{t('addSnapshot')}</button>
```

**Type safety:** `types/next-intl.d.ts` extends `IntlMessages` from `messages/en.json`. Using an unknown key is a TypeScript error.

**Layout setup** (already done — do not duplicate):
- `app/layout.tsx` wraps the tree with `<NextIntlClientProvider messages={messages}>`
- `next.config.mjs` wraps the config with `createNextIntlPlugin()`
- `i18n/request.ts` returns locale `'en'` and loads `messages/en.json`

**Tests:** `vitest.setup.ts` mocks both `next-intl` and `next-intl/server` — assertions use actual English values from `en.json`, not keys. See `testing.md` §2.

---

## 11. Middleware — Next.js 16 deprecation note

Next.js 16 deprecates `middleware.ts` in favour of `proxy.ts`. However, `@supabase/ssr`
requires middleware for session refresh and has not yet published a `proxy.ts` migration guide.

**Do NOT migrate to `proxy.ts`** — wait for official Supabase support. The deprecation
warning can be safely ignored. `middleware.ts` continues to work in Next.js 16+.
