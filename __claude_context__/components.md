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
<p className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
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
  provider: 'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'
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
- `ABPlayer` also takes optional `hideClipA`/`hideClipB` (step 28) — skips
  that slot (heading + player) entirely. Used by `app/tests/[id]/page.tsx`
  once revealed, for a clip whose player would be `UnknownPlayer` (see
  `lib/clips/is-unsupported.ts`) — its link moves into `MappingBadge`'s
  Before/After label instead, so the slot below would otherwise duplicate
  it. `ABPlayer` itself stays unaware of *why* — it only receives a
  boolean, the same "page.tsx decides, player components don't" boundary
  `isCreator`/`isRevealed` already follow everywhere else.
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
- **`google-drive` (step 34) is the one exception to "always fully
  controllable."** `GoogleDrivePlayer` still follows the `forwardRef` +
  `useImperativeHandle` structure above (for type consistency), but its
  `pause()` is a documented no-op and it never calls `onPlay` — Google
  doesn't publish a postMessage/SDK API for its `/preview` embed, unlike
  YouTube's IFrame API or Vimeo's Player.js. Playing a Drive clip won't
  auto-pause a concurrently-playing sibling, and vice versa (the pause
  call just silently does nothing, the same graceful no-op `UnknownPlayer`
  already exercises today). This is a real, accepted limitation, not a bug
  to fix later.

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

### `TechniquePreferencesForm` — reusing the selected-card pattern for a multi-select (step 45)

No shared `Checkbox` UI component exists in this codebase — every "pick
one/many from a list" UI (`VoteForm`'s technique radios, `StepSnapshots`'
snapshot picker above) is a raw `<input>` styled inline via a wrapping
`<label>`, not a component. `TechniquePreferencesForm.tsx` (a top-level
component, alongside `ProfileForm.tsx`, not under `components/tests/`)
follows `StepSnapshots`' exact selected-card styling — a `<label>` wrapping
the input plus a name/description block, with `bg-blue-50 dark:bg-blue-900/20
ring-1 ring-blue-300 dark:ring-blue-700` when selected — but `type="checkbox"`
with no `name` grouping, since more than one can be checked. Deliberately no
new shared `Checkbox` component was introduced for this single use site,
consistent with this repo's no-speculative-abstraction stance
(`repeated-string-constants.md`).

State/submit shape otherwise mirrors `ProfileForm.tsx` exactly: local
`submitting`/`error`/`success` state, `fetch(..., { method: 'PATCH' })`, no
`router.refresh()`. **Each form section on the profile page needs its own
distinctly-worded action button** — `ChangeEmailForm`'s "Send confirmation"
and `ChangePasswordForm`'s "Update password" already establish this;
`ProfileForm`'s generic `saveButton`/`saving` ("Save"/"Saving…") is the one
exception, and reusing those same keys for a second form on the same page
breaks `getByRole('button', { name: 'Save' })` in E2E tests once two
differently-scoped "Save"-prefixed buttons exist on one page (Playwright's
default name matching is substring-based) — `TechniquePreferencesForm` uses
its own `techniquesSaveButton`/`techniquesSaving` keys instead.

### `EditForumLinkButton` — creator-only field edit, deliberately outside the reveal/vote-gated creator-controls block (step 46)

Mirrors `ReplaceClipUrlButton.tsx`'s open/toggle/`router.refresh()` shape
(a plain button that expands into an inline `Callout` with the field plus
Save/Cancel), but simpler — a bare URL `TextInput`, no verify-then-persist
flow, since `tests.forum_link` is only ever displayed, never played back
like a clip URL. **Rendered outside** `app/tests/[id]/page.tsx`'s existing
`isCreator && (!isRevealed || voteCount === 0)` creator-controls block —
that block disappears once a test is revealed *and* has votes, which
would contradict this field's own requirement (editable any time,
regardless of reveal or vote status). Gated on `isCreator` alone.

Applied the `TechniquePreferencesForm` lesson above proactively: its own
i18n keys (`tests.forumLink.saveButton` = "Save forum link", not a reused
generic "Save") from the start, since `ReplaceClipUrlButton`'s own
`tests.replaceClip.saveButton` = "Save" *can* legitimately be open on
screen at the same time (both render independently for the creator, one
inside the creator-controls block, this one outside it) — reusing "Save"
again would have risked the identical Playwright substring-match
ambiguity, not just a hypothetical one.

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
`py-4 sm:py-6` · `gap-4 sm:gap-6` · `text-xl sm:text-2xl`

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

**`lib/tests/format-snapshot-line.ts`** — the shared
"`SystemName · label`  vs  `SystemName · label`" formatter, extracted so
`components/feed/FeedCard.tsx` and `app/tests/[id]/page.tsx` don't each
reimplement the same join/format logic. Each call site still does its own
array-vs-object normalization (the pattern above) on the raw Supabase join
before calling it — the helper itself just takes the already-normalized
`SnapshotSummary` shape and has no visibility opinion of its own; it's the
caller's job to pass `null` for either side when the viewer isn't entitled.

**Which systems/components are under comparison is gated by
`canSeeSystemInfo = isRevealed || isCreator` (step 43)** — deliberately
stricter than `canSeeTally`'s `isRevealed || hasVoted`; voting doesn't
unblind which systems were compared. Three different mechanisms, chosen
per surface's query shape rather than forced to one — intentional, not an
inconsistency to "fix":
- `app/tests/[id]/page.tsx` (single row) — post-fetch redaction: `null` out
  the normalized snapshot values before calling `formatSnapshotLine`.
- `app/page.tsx` + `FeedCard.tsx` (list, mixed reveal status, one query) —
  per-row post-fetch redaction, since a list query can't conditionally
  omit a join per-row and every row's title/badge/vote-count must still
  render regardless of entitlement — only the snapshot sub-field is
  sensitive.
- `app/systems/[id]/page.tsx` (list of whole test rows grouped per
  snapshot) — query-level `.or()` filter (`status.eq.revealed,creator_id.eq.<uuid>`),
  since whole rows are excluded here, not a sub-field, so filtering at the
  query avoids fetching track/clip data for a row that will never render.

Ingested test titles also used to bake the system name in (step 40 Part
B); reverted by step 43 for the same reason — see
`lib/ingestion/ingest-test-payload.ts`'s `resolveTestTitle`.

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

---

## 12. Visual design system (established in build step 20)

Established by an audit of actual class usage, not arbitrary rules — see
`build-history/20-visual-polish.md` for the full rationale. Buttons and status badges
are now real components (`components/ui/Button.tsx`, `Badge.tsx`, built on
`class-variance-authority` — see `docs/dependencies.md`) specifically because
hand-copying the same class string into 15+ files is how the drift this step
cleaned up happened in the first place. Type scale, text color, and border
roles below aren't (yet) componentized — they're conventions to follow by
hand — but don't introduce new shades or one-off combinations for those
either.

**Type scale:** `text-xs` (metadata/badges/timestamps), `text-sm` (body,
inputs, buttons, nav), `text-base sm:text-lg font-semibold` (h2 section
headings — always this exact pair, never plain `text-lg` or plain
`text-base`), `text-xl sm:text-2xl font-semibold` (h1 page headings).

**Text color roles:** primary = default/inherit (or `gray-900`/`gray-100`
dark for emphasis); muted/secondary = `text-gray-500 dark:text-gray-400`
(metadata, labels, timestamps); readable secondary body copy (About-page-style
prose, not metadata) = `text-gray-600 dark:text-gray-300` — a deliberate
second, higher-contrast tier, not a mistake if you see both. Error messages:
`text-red-600 dark:text-red-400`. Never leave a light-mode-only or
dark-mode-only color unpaired — always specify both, since `darkMode: 'media'`
(see `tailwind.config.ts`) means both render for real users.

**Border roles:** exactly two — default (`border-gray-200 dark:border-gray-700`)
and subtle/divider (`border-gray-100 dark:border-gray-800`).

**Status badges — use `<Badge status="..." />` (`components/ui/Badge.tsx`),
never raw `bg-*/text-*` classes:**
```tsx
import { Badge } from '@/components/ui/Badge'
<Badge status="win">Win</Badge>   {/* status: win | loss | draw | blind | revealed | broken | imported */}
```
The color pairing for each status (e.g. `bg-green-100 text-green-700
dark:bg-green-900/40 dark:text-green-300` for `win`) lives in exactly one
place, `badgeVariants` inside `Badge.tsx`. Need a new status? Add a variant
there — don't invent a `bg-*`/`text-*` pair at the call site. `broken`
(step 27, orange — distinct from every other status so it never gets
confused with `loss` or `blind`) takes priority over a test's normal
win/loss/blind/revealed status wherever it's computed: the feed
(`app/page.tsx`/`FeedCard.tsx`), track detail (`app/tracks/[id]/page.tsx`),
and system detail (`app/systems/[id]/page.tsx`) all check "does any of
this test's clips have `url_status = 'dead'`" before falling back to the
normal status logic.

**`imported` (step 32, purple)** — an asymmetric badge, gated differently
depending on what it's describing (step 47 introduced the asymmetry,
worth stating explicitly so a future reader doesn't "fix" it into one
rule):

- **On a *test*** (`FeedCard.tsx`, `app/tests/[id]/page.tsx`, the
  per-test rows in `app/tracks/[id]/page.tsx`) — gated on `isImported =
  !!(test.source_url || test.source_ref)`, **not** the current creator's
  `is_placeholder`. Both columns are set only by the ingestion pipeline,
  never the web wizard, and never reassigned/cleared by
  `claim_placeholder` — so the badge now survives a claim, unlike before
  step 47. OR'd rather than either column alone: `source_url` is
  documented as null for any import predating that column, and the E2E
  fixture for an unclaimed placeholder-owned test (`seedPlaceholderOwnedTest`)
  never sets `source_ref`.
- **On a *system*** (`app/systems/[id]/page.tsx`) — still gated on the
  owner's live `is_placeholder`, unchanged. There's no equivalent
  "this system was originally created under a placeholder identity"
  persistent signal without new schema, and nothing has asked for one.

Independent of, and can appear alongside, the win/loss/blind/revealed/broken
status badge — it describes the *owner or provenance*, not the test's
outcome. The test detail page additionally shows two links, each gated
independently (step 44 — they used to share one `is_placeholder`
condition, which incorrectly hid the first link once a test was claimed):
"view original post" (`tests.source_url`, whenever present — an external
link using `Link` `variant="inline"` with `target="_blank"
rel="noopener noreferrer"`; `Link` already wraps `next/link`, which
renders a plain anchor for an absolute URL) survives a claim (step 39)
unchanged, since `claim_placeholder` reassigns `creator_id` but never
touches `source_url`; a static claim-contact string (`common.claimContact`)
stays gated on `is_placeholder` alone, since once claimed there's no
placeholder identity left to contact about. The feed
card and track's per-test rows show the badge only, not the links — those
rows are already whole-card `<Link>`s to the test's own detail page, so a
nested link isn't valid HTML there; the full detail lives one click away.

**Buttons — use `<Button variant size />` (`components/ui/Button.tsx`),
never raw `bg-black`/`border` classes:**
```tsx
import { Button, buttonVariants } from '@/components/ui/Button'
<Button onClick={...}>Save</Button>                              {/* primary, standard — the default */}
<Button variant="secondary" onClick={...}>Cancel</Button>
<Button size="compact" onClick={...}>+ Add snapshot</Button>      {/* inline/header actions */}

{/* Non-<button> elements styled as a button (e.g. a Next.js <Link>) use the
    exported variant function directly instead of wrapping in <Button>: */}
<Link href="/systems" className={buttonVariants({ variant: 'secondary' })}>Cancel</Link>
```
Two roles (`primary` default / `secondary`) × two size tiers (`standard`
default / `compact`, for inline/header actions) — that's the full matrix, see
`Button.tsx`'s `cva` config for the exact classes per combination. **Primary
always pairs `bg-black` with `dark:bg-white`** (and `text-white` with
`dark:text-black`) — the page background is `#0a0a0a` in dark mode (see
`app/globals.css`), so an unpaired `bg-black` button is invisible against it.
This was a real bug found via manual dark-mode screenshot verification, not
code review — visual changes need an actual rendered check, not just a
class-name audit, which is exactly why this is now a component instead of
copy-pasted classes: get the pairing right once, everywhere inherits it.

Reserve unstyled/underlined links for real page-to-page navigation
(breadcrumbs, pagination, CTAs to `/login`/`/register`) — not in-place
actions like edit/cancel/back, which use `Button`.

A one-off, single-use special case that doesn't fit either role can stay as
raw classes — don't add a variant to `Button`/`Badge` for something used
exactly once; that's the same "don't force an abstraction for its own sake"
rule as everywhere else in this codebase. The amber confirm/trigger buttons
originally in `RevealButton.tsx` were exactly this kind of one-off — until
step 26 needed the identical interaction for deleting a test, snapshot, and
system too. A fourth copy-paste was worse than extracting it once it
actually repeated, so it's now `<ConfirmButton />` (below), not raw classes.

**Links — use `<Link variant size />` (`components/ui/Link.tsx`), never
raw `text-gray-500`/`text-blue-600`/border classes on a `next/link` `Link`:**
```tsx
import { Link } from '@/components/ui/Link'
<Link href="/about" variant="nav" className="shrink-0">About</Link>          {/* header nav */}
<Link href={`/systems/${id}`} variant="card" className="block">...</Link>    {/* bordered row card */}
<Link href="/register">Create a free account</Link>                          {/* variant="inline" is the default */}
<Link href={`/tests/${id}`} size="compact">Test exists →</Link>              {/* smaller inline CTA, e.g. dense lists */}
```
Three roles (`nav | card | inline`, `inline` default) — see `Link.tsx`'s
`cva` config for the exact classes per variant, and `build-history/21-link-component.md`
for the audit behind them. `card`'s `block` vs `flex items-center
justify-between` is a real per-page layout difference, not part of the
variant — pass it via `className`. `size` (`standard` default `| compact`)
only affects `variant="inline"`; don't rely on a plain `className` override
to shrink text size on a `Link` — `cn()`/`clsx` won't reliably make a later
class win over an earlier conflicting one from the variant (that needs
`tailwind-merge`, which this codebase doesn't use).

Breadcrumb links (bare `hover:underline`, no other classes) are deliberately
**not** componentized — one utility class repeated a handful of times
doesn't clear the bar that justified `Button`/`Badge`/`Link`. Keep using
plain `next/link`'s `Link` with `className="hover:underline"` for those.

Always import `Link` from `@/components/ui/Link`, not `next/link`, unless
the link doesn't fit any of the three roles above (e.g. a breadcrumb, or one
already styled via `buttonVariants()`) — in that case import `next/link`
directly (often aliased `NextLink` in files that need both).

**Headings — use `<Heading level={1|2} />` (`components/ui/Heading.tsx`),
never a raw `<h1>`/`<h2>` with a hand-copied class string:**
```tsx
import { Heading } from '@/components/ui/Heading'
<Heading level={1}>{t('heading')}</Heading>   {/* page title */}
<Heading level={2}>{t('sectionHeading')}</Heading>   {/* section heading */}
```
A heading with genuinely different sizing (e.g. `ChangePasswordForm.tsx`'s
smaller `text-sm` disclosure heading) is not a `level={2}` — leave it raw
rather than force a size it doesn't have.

`app/profile/page.tsx`'s admin-only section (step 41 — links to
`/admin/erase-user-data` and `/admin/claim`, shown only when
`isAdminEmail(user.email)`) is a real example of `Heading level={2}` plus
a short stack of `Link variant="inline"` entries — the right shape for a
handful of static links that aren't a list of entities (contrast with
`variant="card"` below, which is for exactly that).

**Field labels — use `<FieldLabel tone />` (`components/ui/FieldLabel.tsx`):**
```tsx
import { FieldLabel } from '@/components/ui/FieldLabel'
<FieldLabel htmlFor="email">Email</FieldLabel>                 {/* tone="standard" is the default */}
<FieldLabel tone="muted" htmlFor="cc-snap-a">Snapshot A</FieldLabel>  {/* dense/inline editors */}
```

**Text fields — use `<TextInput>`/`<TextArea>`/`<Select>`
(`components/ui/TextField.tsx`), never raw `<input>`/`<textarea>`/`<select>`
with a hand-copied class string:**
```tsx
import { TextInput, TextArea, Select } from '@/components/ui/TextField'
<TextInput type="email" value={email} onChange={...} />              {/* size="standard" is the default */}
<TextArea rows={2} value={notes} onChange={...} />
<TextInput size="compact" value={row.role} onChange={...} />         {/* dense inline editors */}
```
All three share one exported `fieldVariants` (`size: standard | compact`) —
same relationship `Button.tsx` has to `buttonVariants`. **Do not add a
`size` prop by any other name** — `<input>`/`<select>` have a *native* HTML
`size` attribute (numeric), so `TextInputProps`/`SelectProps` `Omit` it
before intersecting with the variant props; redo that Omit if you ever
change the prop name.

**Inline error/success text — use `<FormMessage tone />`
(`components/ui/FormMessage.tsx`), never a raw `<p className="text-red-600...">`:**
```tsx
import { FormMessage } from '@/components/ui/FormMessage'
{error && <FormMessage tone="error">{error}</FormMessage>}
{success && <FormMessage tone="success">{t('successMessage')}</FormMessage>}
```

**Alert/info boxes — use `<Callout tone />` (`components/ui/Callout.tsx`):**
```tsx
import { Callout } from '@/components/ui/Callout'
<Callout tone="warning">...</Callout>   {/* tone: warning | success | info | neutral */}
<Callout tone="warning" className="px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">...</Callout>
```
Padding/text-size that differs per instance (e.g. `TallyDisplay.tsx`'s
tighter `px-3 py-2.5`) is a `className` override, not a variant — same
reasoning as `Link`'s `card` variant.

**Two-step confirm/cancel actions — use `<ConfirmButton />`
(`components/ui/ConfirmButton.tsx`), not a hand-rolled `confirming` state +
`Callout` + raw amber buttons:**
```tsx
import { ConfirmButton } from '@/components/ui/ConfirmButton'

async function handleDelete() {
  const res = await fetch(`/api/tests/${testId}`, { method: 'DELETE' })
  const json = await res.json()
  if (!res.ok) return { error: json.error ?? 'Something went wrong' }
  router.push('/')   // caller navigates/refreshes on success; no return value needed
}

<ConfirmButton
  label={t('button')}
  confirmHeading={t('confirmHeading')}
  confirmWarning={t('confirmWarning')}
  confirmLabel={t('confirmButton')}
  pendingLabel={t('deleting')}
  cancelLabel={t('cancelButton')}
  onConfirm={handleDelete}
/>
```
Extracted in step 26 from `RevealButton.tsx`'s original click → inline
confirm/cancel pattern once `DeleteTestButton.tsx`, `SnapshotSection.tsx`,
and `DeleteSystemButton.tsx` needed the exact same interaction. `onConfirm`
owns the actual `fetch` call and what happens after: return `{ error }` to
show an inline `FormMessage` and stay on the confirm step, or navigate/
`router.refresh()` and return nothing when the action succeeded (the
component doesn't assume the caller's target still exists to render into).
Also used by `components/admin/EraseUserDataForm.tsx` (step 38) — there,
`onConfirm` doesn't navigate on success (there's nothing to navigate to;
the erased content/account is simply gone), it clears the preview state
and shows an inline success `FormMessage` instead, same "return `{ error
}` or nothing" contract either way. `components/admin/
ClaimPlaceholderForm.tsx` (step 39) reuses the identical shape — two
text inputs (placeholder/real user ID) instead of one, a preview fetch
before the destructive call becomes available, then `ConfirmButton`
gating the actual `claim_placeholder` call — copied directly from
`EraseUserDataForm.tsx` rather than designed fresh, since a claim is
equally hard to reverse.

**A URL input with a Verify button and inline verified/dead message — use
`<ClipInput />` (`components/clips/ClipInput.tsx`), not a hand-rolled copy:**
```tsx
import { ClipInput } from '@/components/clips/ClipInput'

<ClipInput
  label="A"
  url={url}
  verified={verified}
  onUrlChange={v => { setUrl(v); setVerified(null) }}
  onVerify={() => verify(url, setVerifying, setVerified)}
  verifying={verifying}
  urlPlaceholder={t('urlPlaceholder')}
  verifyLabel={t('verifyButton')}
  verifyingLabel={t('verifying')}
/>
```
Extracted in step 27 from `StepClips.tsx` (test creation) once
`ReplaceClipUrlButton.tsx` (replacing a dead clip's URL, step 27) needed
the exact same URL-input-plus-verify interaction. The caller owns the
`POST /api/clips/verify` call and the URL/verified state; `ClipInput` just
renders the input, button, and result message. Its own inline copy
("This URL could not be reached...", "Verified — ...") is a pre-existing
gap from before `messages/en.json` was the rule for all user-facing
text (step 15) — left as-is rather than fixed in passing, since that gap
isn't this step's job to close.

See `build-history/22-componentize-form-elements.md` for the full audit behind these five
components (exact occurrence counts, and the bugs found and fixed along
the way — a missing dark-mode variant on an info box, a stray `green-700`,
two disagreeing "compact" field sizes, three disagreeing "muted" label
colors). One-off styling that doesn't fit any role (a genuinely unique tab
bar, a single search-result row button, an inline icon-button) stays raw —
same "don't force an abstraction used exactly once" rule as everywhere else
in this codebase.
