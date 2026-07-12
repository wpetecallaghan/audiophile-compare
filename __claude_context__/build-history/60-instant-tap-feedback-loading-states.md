---
name: audiophile-compare-build-history-60
description: Build step 60 — instant tap feedback on Link plus route-level loading.tsx skeletons, fixing a real mobile navigation-lag complaint.
---

# ✅ 60 — Instant tap feedback + route loading states

**The complaint:** on mobile, a noticeable gap between tapping a link and
the next page appearing — a slow connection reads as "did my tap even
register?" Two real, independent causes, both fixed here:

1. **No `loading.tsx` anywhere in `app/`.** Every route is an async server
   component awaiting Supabase (root feed 8 awaits, `tests/[id]` 21,
   `systems/[id]` 9, etc.) — until that resolves, the browser shows nothing
   but the stale previous page.
2. **No visual response at tap-time.** `components/ui/Link.tsx` — used by
   nearly every internal link in the app (nav, card rows, inline CTAs) —
   had no active/pressed state and no pending indicator while the next
   route was being fetched.

## Why not `useLinkStatus`

Next.js ships `useLinkStatus` for exactly problem #2, but it calls React
19's `useOptimistic` internally
(`node_modules/next/dist/client/app-dir/link.js`). This project is pinned
to **React 18.3.1** (`package.json`: `"react": "^18"`, confirmed installed
via `node_modules/react/package.json`) — `useOptimistic` isn't exported by
that version, so calling `useLinkStatus` would throw at runtime. Upgrading
React was explicitly ruled out for this step (bigger blast radius than the
task warranted). Used `useTransition` + `router.push` instead — the
documented pre-`useLinkStatus` pattern for tracking navigation pending
state, and it works the same way on React 18.

Scope was deliberately the shared `Link` component + `loading.tsx` files —
not the raw `next/link` breadcrumbs, `buttonVariants()`-styled links, or
the plain `<a target="_blank">` external links in `MappingBadge.tsx`,
which stay untouched per `components.md §12`'s existing
"don't force componentization" boundary.

## Fix

**`components/ui/Link.tsx`** — now `'use client'` (required for
`useTransition`/`useRouter`; server components still render it freely,
same as any other client component here):

- **CSS, zero-latency layer:** `linkVariants`'s shared `cva` base changed
  from `''` to `'transition active:opacity-60'` — fires on `:active`
  before any JS runs. `card`'s own `transition-colors` was dropped as
  redundant (the base `transition` utility already covers
  color/background/opacity).
- **Pending layer:** click handling wrapped in `useTransition` +
  `useRouter().push()` from `next/navigation`. Intercepts only when safe:
  `href` is a string starting with `/` (internal), no `target="_blank"`
  (the two "view original post" external links in
  `app/tests/[id]/page.tsx:301,320` correctly fall through unaffected), no
  modifier key, primary button only, and only if the caller's own
  `onClick` (if any) didn't already call `preventDefault()`. On intercept:
  `e.preventDefault()` then `startTransition(() => router.push(href))`.
  While `isPending`, applies `opacity-60 pointer-events-none` (blocks
  double-taps) and `aria-busy`. `NextLink` still owns hover/viewport
  prefetch — only click-time behavior changed.

**`components/ui/icons.tsx`** — added `SpinnerIcon`, following the file's
existing hand-rolled SVG pattern (shared `base` object, `className` prop).

**`components/ui/PageLoading.tsx`** (new) — thin async server component:
`<PageShell maxWidth spacing?>` containing a centered, `animate-spin`
`SpinnerIcon` plus an `sr-only` `common.loading` label. Mirrors
`PageShell`'s own `maxWidth`/`spacing` props so each route's `loading.tsx`
matches its `page.tsx`'s shell exactly and nothing shifts once real
content mounts.

**Thirteen new `loading.tsx` files**, one per route that does a real
Supabase round trip (`app/loading.tsx`, `profile`, `systems`,
`systems/new`, `systems/[id]`, `systems/[id]/edit`, `tests/new`,
`tests/[id]`, `tracks`, `tracks/[id]`, `version`,
`admin/erase-user-data`, `admin/claim`) — each a one-line
`<PageLoading maxWidth="..." />`, `maxWidth`/`spacing` matched to that
route's existing `PageShell` call. Skipped `about`/`privacy`/`terms`/
`login`/`register` — confirmed via an await-count audit that each does at
most one `await` (i18n/searchParams), no DB fetch, so already effectively
instant.

**i18n:** added `common.loading` = `"Loading…"` to `messages/en.json` —
a new key, not a reuse of the existing `previewing: "Loading…"` entries
(`admin.eraseUserData`/`admin.claim`), which are a different,
preview-fetch-button-specific context; same "each surface gets its own
wording" precedent `components.md §12` already establishes elsewhere.

## Tests

No existing test coverage for any `components/ui/*` primitive (`Link`,
`PageShell`, `Badge`, etc.) — this codebase only tests components with
real logic, not pure presentational composition. Consistent with that:

- **`components/ui/__tests__/Link.test.tsx` (new, 7 tests)** — the only
  genuinely new logic. Mocks `next/navigation`'s `useRouter` and
  `next/link` (full prop passthrough, unlike other test files' `next/link`
  mocks, since this suite needs `onClick`/`target`/`aria-busy` to actually
  reach the rendered anchor). Covers: plain click on an internal href
  calls `preventDefault` + `router.push`; cmd/ctrl/shift/alt-click (via
  `fireEvent` — `userEvent.click()`'s modifier-key option isn't reliably
  forwarded) and middle-click (via `userEvent.pointer`) are not
  intercepted; `target="_blank"` and a non-internal href are not
  intercepted; a caller-supplied `onClick` still fires and can veto
  interception via its own `preventDefault()`; not `aria-busy` before any
  navigation is triggered. Repeated href/label fixture extracted to local
  `INTERNAL_HREF`/`LINK_TEXT` constants per `repeated-string-constants.md`.
- `PageLoading`, `SpinnerIcon`, and the thirteen `loading.tsx` files are
  pure composition with no branching logic — no dedicated tests, matching
  `PageShell`/`Badge`/`Heading` precedent.

The pending-state class/`aria-busy` toggle itself isn't meaningfully unit-
testable in isolation: with a mocked `useRouter`, `push()` triggers no
real state update, so React's `isPending` has nothing to stay pending on —
that behavior is only real against Next's actual router, verified manually
instead (see below).

## Files changed

- `components/ui/Link.tsx`
- `components/ui/icons.tsx`
- `components/ui/PageLoading.tsx` (new)
- `components/ui/__tests__/Link.test.tsx` (new)
- `messages/en.json` — added `common.loading`
- 13 new `loading.tsx` files (see list above)

## Verified

- `npm test` — 51 files / 542 tests passing (7 new, no regressions).
- `npx tsc --noEmit` clean on every file touched here (pre-existing,
  unrelated type errors in `__tests__/supabase-client.test.ts` and
  `supabase-server.test.ts` predate this step).
- Curled the running dev server (which hot-reloaded the changes): `/`
  renders with no hydration errors and the compiled output contains
  `active:opacity-60`; protected routes (`/tracks`, `/version`) still
  correctly 307-redirect unauthenticated requests to `/login`.
- **Not verified on a real mobile device or with DevTools network
  throttling** — curl can't exercise tap/click interaction or observe the
  transient pending state. Left as a follow-up for the user to confirm the
  actual feel on-device.
