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

## 3. Dates — format using the visiting browser's locale (build step 49)

Every rendered date (`created_at` etc.) uses `date.toLocaleDateString(locale)`,
where `locale` comes from `lib/dates/get-request-locale.ts` — it reads the
`Accept-Language` request header (via `next/headers`, Server-Component-only)
and returns the visitor's preferred locale, e.g. `'en-GB'` → `25/03/2024`,
`'en-US'` → `3/25/2024`. Falls back to `undefined` (today's implicit runtime
default) if the header is missing or malformed — `parseAcceptLanguage`
(`lib/dates/parse-accept-language.ts`) validates the tag via `Intl` first,
since the header is client-controlled input and a bad BCP 47 tag throws.

**Standalone pages** (`app/tests/[id]/page.tsx`, `app/tracks/[id]/page.tsx`,
`app/systems/page.tsx`, `app/systems/[id]/page.tsx`) call `await
getRequestLocale()` directly. **Reusable render components** (`FeedCard`,
`SnapshotSection`) take an optional `locale?: string` prop instead — their
parent page resolves it once and passes it down, rather than each row/instance
re-resolving the same per-request header.

This is also *why* `SnapshotSection` (a `'use client'` component) no longer
needs `suppressHydrationWarning` on its date: before this, the bare
`toLocaleDateString()` genuinely differed between the server's SSR pass
(Node's locale) and the client's hydration pass (the browser's locale) — a
real mismatch, band-aided rather than fixed. Passing `locale` as a prop
resolved from `Accept-Language` makes the value identical on both passes
(it's baked into the same SSR payload used for hydration), so the mismatch
is gone, not just silenced. If you add a new locale-dependent client
component, prefer threading `locale` down as a prop the same way — reaching
for `suppressHydrationWarning` again is treating the symptom.

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
import type { ClipProvider, MediaType } from '@/lib/clips/detect-provider'

export type ClipData = {
  id: string
  label: 'A' | 'B'
  source_url: string
  provider: ClipProvider
  media_type: MediaType
  canonical_url?: string
  embed_id?: string | null
}
```
`ClipProvider` (`'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'`) and
`MediaType` (`'audio' | 'video' | 'unknown'`) are owned by
`lib/clips/detect-provider.ts` — every file needing either union (API routes,
`lib/types/test-creation.ts`, `lib/clips/check-url.ts`, `e2e/helpers/admin.ts`,
`ClipData` here) imports the type rather than redeclaring the literals.

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
  `lib/clips/is-unsupported.ts`) — its link moves into `MappingBadge`'s own
  clip slot instead (an "Open link directly" link, step 67), so the slot
  below would otherwise duplicate it. `ABPlayer` itself stays unaware of
  *why* — it only receives a
  boolean, the same "page.tsx decides, player components don't" boundary
  `isCreator`/`isRevealed` already follow everywhere else. As of step 54,
  `isUnsupportedClip` only returns true for `provider === 'unknown'` (a
  URL that never parsed) — a `direct` clip is never hidden this way, even
  with `media_type: 'unknown'`, since it always gets a real inline
  playback attempt (see `NativePlayer` below).
- **`NativePlayer` (`direct` clips, step 54, redesigned step 56)** always
  attempts playback regardless of `media_type` — a server-resolved
  `'unknown'` media_type reflects an unreliable/missing `Content-Type`
  header, not proof the file can't play. `MediaPlayer.tsx` defaults an
  unresolved `media_type` to `'video'` (not `'audio'`) when dispatching,
  since a `<video>` element still plays audio-only files acceptably.
  It also passes `url={clip.canonical_url ?? clip.source_url}` (the
  playable URL, possibly rewritten — e.g. Dropbox's `raw=1`, step 56) and
  `fallbackUrl={clip.source_url}` (always the original, human-friendly
  URL) as two separate props, since these diverge for Dropbox but must
  stay in sync everywhere else.
  **There is no load timeout.** An earlier version tried "wait up to Xms,
  then give up and show the link" (3s in step 54, 5s in step 56) to
  detect e.g. a Google Photos share link that resolves to an HTML page,
  not media — but real Dropbox clips on a cold connection kept
  intermittently missing both durations, and no fixed duration is both
  short enough to not feel broken on a dead link and long enough to never
  misfire on a slow-but-working one. Instead: `UnknownPlayer`'s link-out
  is the **default**, rendered immediately; the `<audio>`/`<video>`
  element is mounted alongside it (visually hidden via `hidden`
  className) and attempts to load in the background. Only
  `onLoadedMetadata` — proof real media data arrived, since parsing HTML
  as a media container can't produce that event — swaps them: link
  hidden, player revealed. If the element errors, or metadata never
  arrives, the link was already showing and just stays there — no
  failure state to detect, no duration to guess, no way to misfire in
  either direction.
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
  `useImperativeHandle` structure above (for type consistency), but
  Google doesn't publish a postMessage/SDK API for its `/preview` embed,
  unlike YouTube's IFrame API or Vimeo's Player.js, so both playback
  control and sizing are approximated rather than exact:
  - `pause()` force-remounts the iframe via a key bump (step 53) — the
    only way to actually halt playback without a control SDK. Losing the
    sibling's playback position is an accepted trade-off.
  - Play detection polls `document.activeElement` (step 53) rather than
    a real event, since neither `window.blur` nor `focusin` reliably
    fires for a cross-origin iframe gaining focus more than once — see
    `GoogleDrivePlayer.tsx`'s comments for the full investigation.
  - The embed always **crops** the video to fill its iframe box, rather
    than letterboxing a non-matching aspect ratio the way YouTube's and
    Vimeo's players do (step 55, found via a real mobile report).
    Confirmed via loading the `/preview` URL directly with no wrapper CSS
    at two different container shapes — it cropped both times, so this
    is Drive's own cross-origin rendering, not something our CSS
    controls. Accepted as a real, unfixable-from-our-side limitation, not
    a bug to chase.

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

**Each form section that can render alongside another needs its own
distinctly-worded action button** — `ChangeEmailForm`'s "Send confirmation"
and `ChangePasswordForm`'s "Update password" establish this;
`ProfileForm`'s generic `saveButton`/`saving` ("Save"/"Saving…") is the one
exception. Applied proactively here: its own i18n keys
(`tests.forumLink.saveButton` = "Save forum link", not a reused generic
"Save") from the start, since `ReplaceClipUrlButton`'s own
`tests.replaceClip.saveButton` = "Save" *can* legitimately be open on
screen at the same time (both render independently for the creator, one
inside the creator-controls block, this one outside it) — reusing "Save"
again would have risked a Playwright substring-match ambiguity in
`getByRole('button', { name: 'Save' })` (default name matching is
substring-based), not just a hypothetical one.

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

**`MappingBadge.tsx` shows each clip's own snapshot under its clip label
(step 65, refined step 67).** Clip A always corresponds to `snapshot_a_id`,
clip B to `snapshot_b_id` — a documented invariant across every
test-creation path (the web wizard, cross-check, and ingestion) — so
`MappingBadge` takes `snapshotA`/`snapshotB` props and renders
`formatOneSnapshot(...)` (exported from `format-snapshot-line.ts`) under
each side. No new gating check needed: `MappingBadge` only renders once
`isRevealed` is true, at which point `canSeeSystemInfo` is already true for
every viewer. Because this duplicates what the page header's own
`snapshotLine` used to show unconditionally, `app/tests/[id]/page.tsx`
gates that header line on `!isRevealed` — it remains the only source of
this info for a creator viewing their own still-blind test (the one case
`MappingBadge` doesn't render for), and disappears once revealed since
`MappingBadge` takes over.

**Step 67 removed two redundancies from `MappingBadge`**, once the snapshot
text above made them extra ceremony rather than the only source of that
information: the Callout's own "Revealed" heading (the page's status
eyebrow, `t('revealedStatus')`, already says this once, directly above),
and the explicit "Before"/"After" wording per clip (the clip's own snapshot
text — e.g. "Living room rig · v2 new DAC" — already identifies it).
`MappingBadge` now renders just `Clip A`/`Clip B` plus each side's snapshot
text. Because the Before/After words are gone, the component no longer
needs `clip_mapping`'s `before_clip_id`/`after_clip_id` values at all — its
`clipAId`/`beforeClipId`/`afterClipId` props were deleted along with the
`aIsBefore` logic that was their only reader. An unsupported clip's link
(§5 above) now renders the same `tests.openClipLink` ("Open link directly")
copy `MediaPlayer`'s own unsupported-clip fallback uses elsewhere, reused
rather than duplicated — see
`build-history/67-mapping-badge-ia-tidy.md`.

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
cleaned up happened in the first place. Border roles below aren't (yet)
componentized — a convention to follow by hand — but don't introduce new
shades or one-off combinations for those either. Type scale and text color
roles **are** componentized as of build step 52 — see `Text` in §13 — but
the roles themselves are described here first since `Text` is just their
concrete implementation.

**Type scale:** `text-xs` (metadata/badges/timestamps), `text-sm` (body,
inputs, buttons, nav), `text-base sm:text-lg font-semibold` (h2 section
headings — always this exact pair, never plain `text-lg` or plain
`text-base`), `text-xl sm:text-2xl font-semibold` (h1 page headings).

**Text color roles:** primary = default/inherit (or `gray-900`/`gray-100`
dark for emphasis); muted/secondary = `text-gray-500 dark:text-gray-400`
(metadata, labels, timestamps) = `<Text tone="muted">` (the default tone);
readable secondary body copy (About-page-style prose, not metadata) =
`text-gray-600 dark:text-gray-300` = `<Text tone="body">` — a deliberate
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
  if (!res.ok) return { error: json.error ?? tCommon('somethingWentWrong') }
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

**`AdminClipOverrideControl.tsx` (step 64) — admin-only, separate from "Creator controls":**
Renders once per clip (A and B) in its own section on the test detail page,
gated by `isAdminEmail(user?.email)` directly rather than `isCreator` — any
admin viewing any test needs this, not just the test's own creator, unlike
the `RevealButton`/`DeleteTestButton`/`ReplaceClipUrlButton` row just below
it (creator-only). Shows the clip's raw cron `url_status` alongside any
active `admin_override` so an admin can tell a warning is currently
masked/forced, plus whichever of "Mark broken" / "Mark not broken" /
"Clear override" isn't the current state — same fetch-then-`router.refresh()`
shape as `ReplaceClipUrlButton.tsx`. See `audiophile-compare-schema.md`'s
"Admin clip-health override" section for the data model.

See `build-history/22-componentize-form-elements.md` for the full audit behind these five
components (exact occurrence counts, and the bugs found and fixed along
the way — a missing dark-mode variant on an info box, a stray `green-700`,
two disagreeing "compact" field sizes, three disagreeing "muted" label
colors). One-off styling that doesn't fit any role (a genuinely unique tab
bar, a single search-result row button, an inline icon-button) stays raw —
same "don't force an abstraction used exactly once" rule as everywhere else
in this codebase.

---

## 13. Page-level layout — `PageShell`/`Text`/`Section`/`RowCard`/`PageHeader` (build step 52)

Same motivation as step 22, one layer up — page-level structure (the
`<main>` wrapper, `<section>` groupings, muted/body text, list-item cards,
title+subtitle headers) was still hand-copied across all 17 `app/**/page.tsx`
files. Found via a full audit (three parallel reviews, cross-referenced);
see `build-history/52-componentize-page-layout.md` for the full catalog,
including patterns identified but deliberately **not** componentized yet
(`Breadcrumbs`, `AuthShell`, `ClipHealthWarning`, `Divider`, `Byline`,
`SectionHeading`, `ButtonRow`).

**The page wrapper — use `<PageShell maxWidth />` (`components/ui/PageShell.tsx`),
never a raw `<main className="container mx-auto max-w-...">`:**
```tsx
import { PageShell } from '@/components/ui/PageShell'
<PageShell maxWidth="2xl">...</PageShell>   {/* static/content/admin pages */}
<PageShell maxWidth="4xl">...</PageShell>   {/* feed, profile, systems, tracks, tests */}
<PageShell maxWidth="4xl" spacing="responsive">...</PageShell>  {/* tests/[id] only — space-y-4 sm:space-y-6 */}
```
`login`/`register` deliberately don't use `PageShell` — they're a
different, centered-card shell (`AuthShell` in the catalog, not built yet).

**Muted/body text — use `<Text size tone as />` (`components/ui/Text.tsx`),
never a raw `<p>`/`<span>` with a hand-copied color class:**
```tsx
import { Text } from '@/components/ui/Text'
<Text>{t('subheading')}</Text>                          {/* size="sm" tone="muted" — the default */}
<Text size="xs">{new Date(x).toLocaleDateString()}</Text>
<Text tone="body">{t('whyBody1')}</Text>                 {/* about/privacy/terms prose */}
<Text as="span" size="xs">{t('pageOf', { page, total })}</Text>
<Text size="xs" className="truncate">{track.album}</Text>  {/* modifiers via className, same as Badge/Link */}
```
This is the concrete implementation of the "text color roles" described in
§12 — see that section before reaching for a raw color class here.

**A heading-led content group — use `<Section heading? />`
(`components/ui/Section.tsx`), never a raw `<section className="space-y-3">`:**
```tsx
import { Section } from '@/components/ui/Section'
<Section heading={t('whyHeading')}>
  <Text tone="body">{t('whyBody1')}</Text>
</Section>
<Section>{/* no heading prop when the section's own child already renders one */}
  <h2 className="text-sm font-semibold">{t('changeEmailHeading')}</h2>
  <ChangeEmailForm />
</Section>
```
`profile.tsx`'s `text-sm font-semibold` raw `<h2>` is a genuinely
smaller size than `Heading level={2}` — same judgment call as
`ChangePasswordForm.tsx`'s disclosure heading in §12, left raw rather than
forced.

**A list-item card (title, optional subtitle, optional trailing content) —
use `<RowCard href title subtitle? trailing? />` (`components/ui/RowCard.tsx`),
never a hand-rolled `<li><Link variant="card">...`:**
```tsx
import { RowCard } from '@/components/ui/RowCard'
<RowCard
  href={`/tests/${test.id}`}
  title={test.title}
  subtitle={<Text size="xs">{creator} · {date}</Text>}
  trailing={<Badge status={badge.status}>{badge.text}</Badge>}
/>
```
Found independently duplicated (with small unintentional divergences —
`items-start` vs `items-center`, `ml-4` vs `gap-4`, presence/absence of
`truncate`) in `FeedCard.tsx`, `systems/page.tsx`, `systems/[id]/page.tsx`,
`tracks/page.tsx`, and `tracks/[id]/page.tsx`. Those divergences were
resolved onto one canonical layout (`items-start`, `gap-4`, always
`truncate`) rather than preserved via a variant prop — `items-start` was
picked over the more common `items-center` (3 of the 5 original sites)
specifically because a real side-by-side visual diff against staging
caught `FeedCard.tsx`'s badge visibly re-centering against its multi-line
subtitle block — the one non-neutral visual change out of the whole step.
`FeedCard.tsx`'s badge keeps its original `mt-0.5` nudge via `className`
passthrough; the newly-`items-start` sites (which never had that nudge
before) don't need one.

**A page title block (optional eyebrow, title, optional subtitle, optional
trailing actions) — use `<PageHeader eyebrow? title subtitle? actions? />`
(`components/ui/PageHeader.tsx`):**
```tsx
import { PageHeader } from '@/components/ui/PageHeader'
<PageHeader
  eyebrow="System"
  title={system.name}
  subtitle={system.description}
  actions={isOwner && <NextLink href={editHref} className={buttonVariants({ variant: 'secondary', size: 'compact' })}>Edit</NextLink>}
>
  {/* extra meta content below the subtitle, e.g. a snapshot-count line */}
</PageHeader>
```
Used on `app/page.tsx`, `app/profile/page.tsx`, `app/systems/[id]/page.tsx`,
and both admin pages. **Not** used on `tracks/[id]/page.tsx` or
`tests/[id]/page.tsx` — both have richer headers (eyebrow + a
creator/date/vote-count/imported-badge "byline" line, sometimes two
subtitle lines) that don't fit the single-`subtitle`-slot shape; forcing
them in would either drop content or require a shape mismatched to every
other caller. Left as raw JSX pending a future `Byline` component (see the
catalog) rather than bent to fit.

---

## 14. Item-to-item footer navigation — `FooterPortal` (First/Previous/All/Next/Last, build step 61)

`tests/[id]/page.tsx` and `tracks/[id]/page.tsx` both let a viewer step to
the next/previous sibling record without going back to the list first,
via a persistent First/Previous/All/Next/Last control row in the global
footer. This pattern first shipped on `tests/[id]` in an earlier commit
("Add navigation between tests", `c0dbc31`) that predates this file ever
documenting it — step 61 (which added the `tracks/[id]` version) writes it
up properly for both call sites here instead of leaving the gap.

**The plumbing:** `SiteFooter` (`components/SiteFooter.tsx`) renders a
persistent slot identified by `footer-nav-slot.ts`'s `FOOTER_NAV_SLOT_ID`.
`<FooterPortal>` (`components/ui/FooterPortal.tsx`, client — needs
`useEffect`/`createPortal`) portals its children into that slot once
mounted. Because the slot lives in the global layout outside the
scrollable page content, the nav controls stay visible without scrolling —
and because the portal only mounts client-side after the page's own async
data has resolved, a route's `loading.tsx` skeleton correctly shows no nav
placeholder (verified for both `tests/[id]/loading.tsx` and
`tracks/[id]/loading.tsx`).

**The five-control shape**, always in this order — First
(`ChevronsLeftIcon`) / Previous (`ChevronLeftIcon`) / All (`ListIcon`,
unconditional, links back to the originating list) / Next
(`ChevronRightIcon`) / Last (`ChevronsRightIcon`) — each rendered as
`<FooterNavLink aria-label={t('nav.*')} />` (`components/ui/FooterNavLink.tsx`,
step 68), icons from `components/ui/icons.tsx`:
```tsx
<FooterPortal>
  <div className="flex items-center gap-3">
    {firstId && <FooterNavLink href={`/tracks/${firstId}`} aria-label={t('nav.first')}><ChevronsLeftIcon className="w-4 h-4" /></FooterNavLink>}
    {prevId && <FooterNavLink href={`/tracks/${prevId}`} aria-label={t('nav.previous')}><ChevronLeftIcon className="w-4 h-4" /></FooterNavLink>}
    <FooterNavLink href={navBackHref} aria-label={t('nav.all')}><ListIcon className="w-4 h-4" /></FooterNavLink>
    {nextId && <FooterNavLink href={`/tracks/${nextId}`} aria-label={t('nav.next')}><ChevronRightIcon className="w-4 h-4" /></FooterNavLink>}
    {lastId && <FooterNavLink href={`/tracks/${lastId}`} aria-label={t('nav.last')}><ChevronsRightIcon className="w-4 h-4" /></FooterNavLink>}
  </div>
</FooterPortal>
```
First/Previous/Next/Last are conditionally rendered — a `null` from the
position helper hides that control entirely rather than disabling it.

**`FooterNavLink` (step 68) grows each control's touch target to 44×44px.**
Wraps `<Link variant="nav">` (never call `Link variant="nav"` directly for
one of these five controls — always go through `FooterNavLink`, the same
"componentize once duplicated 3+ times" precedent as `RowCard`/`PageHeader`)
with `flex items-center justify-center w-11 h-11 rounded-full
hover:bg-gray-100 dark:hover:bg-gray-800`. Before this, the clickable `<a>`
was exactly the bare 16px icon with **no** padding — confirmed by reading
every call site — well under the ~44×44px minimum recommended for a touch
target (iOS HIG, WCAG 2.5.5) and hard to land with a fingertip on a real
phone. The icon's own visual size (`w-4 h-4`) is unchanged; only the
invisible padding around it grows, plus a rounded hover fill so the actual
tappable region is visible rather than just bigger. Feed pagination
(`app/page.tsx`, step 66/68) and both `[id]` detail pages all use it — this
is the *only* place `variant="nav"` needs the larger target; `SiteHeader`'s
and `SiteFooter`'s plain text nav links (`variant="nav"` too) are untouched,
since a multi-character text link is already a reasonable tap width and
wasn't part of what step 68 found.

**The position math** — `getAdjacentIds(ids, currentId)`
(`lib/nav/get-adjacent-ids.ts`, added step 61): a pure, unit-tested helper
(`lib/nav/__tests__/get-adjacent-ids.test.ts`) shared by both call sites,
taking a same-order id list and the current id and returning
`{ prevId, nextId, firstId, lastId }`. Originally duplicated inline on
`tests/[id]` alone; extracted once a second call site (`tracks/[id]`) needed
the identical formula, same "found duplicated, so componentize/extract"
precedent as §13's `RowCard`.

**A same-route searchParam-only pagination needs its own `<Suspense key>` —
`app/loading.tsx` alone doesn't cover it (build step 66).** `tests/[id]` and
`tracks/[id]`'s First/Previous/Next/Last change the dynamic route segment
(`/tests/[id1]` → `/tests/[id2]`), which Next.js suspends behind that
route's `loading.tsx` automatically. The feed's own pagination
(`app/page.tsx`, `/?page=1` → `/?page=2`) only changes a searchParam on the
*same* route — Next.js treats that as a lighter-weight update and never
reaches `app/loading.tsx`'s Suspense boundary, confirmed directly (an
artificial network delay showed the `[id]` case's skeleton reliably and the
feed's not at all, however long the delay). Fix: `app/page.tsx` wraps its
data-dependent content in an explicit `<Suspense key={page} fallback={
<PageLoading maxWidth="4xl" />}>`, keyed on the page number, inside the page
component itself — the changing `key` forces React to treat every page
navigation as a fresh subtree regardless of how Next.js classifies it. Don't
flatten `app/page.tsx` back into one plain async function — that silently
regresses this skeleton on a slow connection without failing anything on a
fast one. See `build-history/66-feed-pagination-loading-skeleton.md` for the
full investigation.

**Where the two call sites differ** — only in how `ids` is built, never in
the position math or the JSX above:
- `tests/[id]/page.tsx`: a test can be reached from three different origin
  lists (`from=feed|track|system` searchParams), so it re-runs that
  origin's exact query/order to reconstruct `ids`, and `navBackHref` can be
  `null` for an unrecognized `from` — the whole nav block is conditionally
  rendered on `navBackHref` being truthy.
- `tracks/[id]/page.tsx`: exactly one origin — the flat, unpaginated
  `/tracks` list (`.order('artist').order('title')`) — so no `from`/
  `fromId` searchParams are needed, and `navBackHref` is always `/tracks`;
  the nav block renders unconditionally.

**Translation convention:** each entity gets its own `<entity>.nav.*` block
in `messages/en.json` (`tests.nav.*`, `tracks.nav.*`) with entity-specific
copy ("First test" vs. "First track"), not a shared `common.nav.*` —
consistent with §10's "each surface gets its own wording" precedent.

---

## 15. Page transition crossfade — View Transitions API (build step 63)

`Link.tsx` (§12) wraps its intercepted navigation in
`document.startViewTransition()` when the browser supports it, so the
outgoing page crossfades into the incoming `loading.tsx` skeleton (§ Step
60 file layout) instead of the hard cut that pattern otherwise produces.
Feature-detected per click (`typeof document.startViewTransition ===
'function'`) — no call-site changes needed elsewhere, every `<Link
variant="nav|card|inline" />` gets this automatically. Silently falls back
to the pre-existing plain `startTransition(() => router.push(href))` on
browsers without it (Firefox, older Safari) — never a hard requirement.

**Not React's own `<ViewTransition>` component** — that's a React 19
canary API, and this project is pinned to React 18 (same constraint §
Step 60 hit with `useLinkStatus`). `document.startViewTransition()` is a
plain browser API with no React version dependency.

**The resolve lives in a root-mounted provider, not in `Link` itself.**
`ViewTransitionResolverProvider` (`components/ui/ViewTransitionResolver.tsx`,
wrapped around the app in `app/layout.tsx`) watches `usePathname()` +
`useSearchParams()` and resolves whatever `resolve` callback `Link.tsx`
last registered via `useRegisterViewTransition()` once the route settles.
This is deliberate, not incidental complexity: the clicked `Link` is
routinely the very thing that unmounts once its own navigation completes
(a card link into the page it's replacing), so tracking the resolve in the
`Link`'s own local state — the first thing tried — silently breaks for
exactly that case (see `build-history/63-view-transition-page-crossfade.md`
for the real `TimeoutError` this produced). Keyed off pathname **and**
searchParams, not pathname alone, since this app has same-pathname/
different-searchParams navigations (`/tests/[id]?from=feed&page=1`'s
pagination-origin query params) that a pathname-only watcher would miss.
`Link.tsx` also carries a `VIEW_TRANSITION_FALLBACK_MS` (1.5s) safety timer
for the one case the route watcher structurally can't see settle — a link
back to the current URL.

`useRegisterViewTransition()` returns `null`, rather than throwing, when
no provider is mounted — `Link.tsx`'s `&& registerViewTransition` guard
means it degrades to plain navigation instead of crashing if ever rendered
outside the root layout (unit tests, in particular).

**CSS:** the crossfade duration (`0.36s`) and a `prefers-reduced-motion`
override live in `app/globals.css` as plain `::view-transition-*`
selectors — global, not per-component, since the transition is between two
whole pages, not a scoped element.
