---
name: audiophile-compare-build-history-63
description: Build step 63 — browser-native View Transitions crossfade on internal Link navigation, replacing step 60's hard-cut loading.tsx swap; two real bugs found and fixed along the way.
---

# ✅ 63 — View transition crossfade on internal navigation

**The complaint:** step 60 gave every route a `loading.tsx` skeleton and
instant tap feedback on `Link`, but the actual page swap is still a hard
cut — the outgoing page disappears the instant `router.push` fires and the
skeleton appears in its place. Feedback after using it on mobile: this
reads as abrupt rather than a transition.

## Why the browser-native View Transitions API, not React's `<ViewTransition>`

React ships its own `<ViewTransition>` component, but it's a React 19
canary API. This project is pinned to **React 18.3.1** — the same
constraint step 60 already hit with `useLinkStatus` (see that step's file).
`document.startViewTransition()` is a plain browser API with no React
version dependency, so it was used directly instead: feature-detected in
`Link.tsx`, silently falling back to the existing step 60 behavior where
unsupported (Firefox, older Safari).

## Two real bugs found while wiring it up

**1. Resolving on the next commit, not on actual route completion.**
The first version resolved the transition's update-callback promise from a
`useEffect` that fired on the very next React commit after the click. But
`router.push`'s RSC fetch is still in flight at that point — resolving
early made the browser snapshot the "after" state while the old page was
still on screen, so no crossfade was visible at all, just the same hard
cut as before with extra code around it.

**2. Local per-`Link` state doesn't survive the `Link` unmounting.**
The fix for #1 was to key the resolve off `isPending` (from
`useTransition`) flipping back to `false`, tracked in local component
state on the `Link` itself. This works for a `Link` that stays mounted
across the navigation (nav bar entries) but **breaks entirely for a card
link into the very page it's replacing** — the `Link` component itself
unmounts once the new route lands, so its local state, and the `resolve`
closure sitting in it, are simply gone. Reproduced for real against the
running dev server: clicking from a list into a detail page threw
`Runtime TimeoutError: View transition update callback timed out` /
an `unhandledRejection`, since the browser's own ~4s internal timeout was
the only thing that ever fired.

**Fix:** moved the resolve out of `Link` entirely, into a new
`ViewTransitionResolverProvider` (`components/ui/ViewTransitionResolver.tsx`,
new file) mounted once in `app/layout.tsx` — a root layout persists across
every navigation, unlike the `Link` that triggered one. It watches
`usePathname()` **and** `useSearchParams()` (not pathname alone, the usual
simplest version of this pattern) via a small internal `RouteWatcher` leaf
component wrapped in its own `<Suspense fallback={null}>` — this app has
real same-pathname/different-searchParams navigations (e.g.
`/tests/[id]?from=feed&page=1`'s pagination-origin query params), which a
pathname-only watcher would silently miss. `Link.tsx` registers its
`resolve` via `useRegisterViewTransition()` instead of tracking it itself;
`useRegisterViewTransition()` deliberately returns `null` rather than
throwing when no provider is mounted, so `Link` degrades to plain
navigation rather than crashing if ever rendered outside the app's root
layout (tests, in particular).

**Remaining edge case, covered by a fallback timer, not the route
watcher:** a link back to the *same* URL never changes `pathname` or
`searchParams`, so the route watcher can't see it settle. `Link.tsx`'s
`VIEW_TRANSITION_FALLBACK_MS` (1.5s) resolves the transition on its own if
the registered resolve never fires, so this case degrades to "the
crossfade times out and shows the content anyway" instead of a real
`TimeoutError`.

## Fix

**`components/ui/ViewTransitionResolver.tsx`** (new) — `ViewTransitionResolverProvider`
(wraps the app in `app/layout.tsx`, inside `NextIntlClientProvider`, around
`SiteHeader`/content/`SiteFooter`) plus the `useRegisterViewTransition()`
hook `Link.tsx` calls. Internal `RouteWatcher` leaf component is the only
piece that calls `useSearchParams()` (which requires a `Suspense`
boundary to avoid opting the whole tree into client-only rendering).

**`components/ui/Link.tsx`** — `handleClick` now branches on
`typeof document.startViewTransition === 'function' && registerViewTransition`:
when true, wraps `startTransition(() => router.push(href))` inside
`document.startViewTransition(() => new Promise(...))`, registering the
promise's `resolve` with the provider and starting the
`VIEW_TRANSITION_FALLBACK_MS` (1500, module-scope named constant —
`setTimeout`/timeout-class constant, same precedent as `POLL_MS` in
`GoogleDrivePlayer.tsx` and `REQUEST_DELAY_MS` in `scrape-lejonklou.ts`,
worth naming even at a single call site) safety timer; when false, falls
straight to the pre-existing `startTransition(() => router.push(href))`
with no wrapping. The tap-dimming (`isPending`/`aria-busy`) from step 60 is
untouched — this step only changes what happens once the click is
intercepted.

**`app/globals.css`** — a `0.36s` crossfade on `::view-transition-old(root)`/
`::view-transition-new(root)` (doubled from an initial `0.18s` after
trying it and finding it too fast), plus a `prefers-reduced-motion:
reduce` override disabling the animation entirely for users who've
requested it. Left as a plain CSS value, not a named constant/custom
property — single occurrence, never repeats, and CSS timing values aren't
the class of JS/TS literal `repeated-string-constants.md` is about.

**`app/layout.tsx`** — wraps `SiteHeader`/content/`SiteFooter` in
`ViewTransitionResolverProvider`, inside the existing
`NextIntlClientProvider`.

## Tests

Step 60's own precedent (`components/ui/*` primitives are otherwise
untested — "pure composition with no branching logic") explicitly doesn't
apply here: both new pieces are branching logic, not presentation.

- **`components/ui/__tests__/Link.test.tsx` (extended, +4 tests)** — the
  existing 7 tests only ever exercised the fallback branch (jsdom has no
  `document.startViewTransition`, so it was untested by omission, not by
  design). Added a `describe('Link — view transition crossfade')` block,
  mocking `../ViewTransitionResolver`'s `useRegisterViewTransition`
  independently of `document.startViewTransition` support: a supported
  browser with a resolver present calls `document.startViewTransition` and
  registers a resolve function while still calling `router.push`; an
  unsupported browser (no `document.startViewTransition`) falls back to
  plain navigation; a supported browser with no resolver available (no
  provider in the tree) also falls back, proving the `&&
  registerViewTransition` guard actually gates the feature; and, using
  fake timers, the transition resolves on its own after
  `VIEW_TRANSITION_FALLBACK_MS` if the registered resolve never fires,
  with the registered resolve still safely callable afterward (the
  `settled` guard). `document.startViewTransition` is stubbed per-test and
  deleted in `afterEach` so it never leaks into the other tests in this
  file.
- **`components/ui/__tests__/ViewTransitionResolver.test.tsx` (new, 4
  tests)** — mocks `next/navigation`'s `usePathname`/`useSearchParams`
  with reassignable module-level values, driving route changes via
  `rerender`: `useRegisterViewTransition()` returns `null` outside a
  provider; a registered resolve fires exactly once when the pathname
  changes; does *not* fire on a rerender with an unchanged pathname and
  searchParams; and fires on a searchParams-only change with the pathname
  held constant — the case this app actually needs, and the reason the
  watcher keys off both rather than pathname alone.

## Files changed

- `components/ui/Link.tsx`
- `components/ui/ViewTransitionResolver.tsx` (new)
- `components/ui/__tests__/Link.test.tsx`
- `components/ui/__tests__/ViewTransitionResolver.test.tsx` (new)
- `app/layout.tsx`
- `app/globals.css`

## Verified

- `npm test` — 53 files / 556 tests passing (8 new: 4 in `Link.test.tsx`,
  4 in `ViewTransitionResolver.test.tsx`; no regressions).
- `npx tsc --noEmit` clean on every file touched here (the two
  pre-existing, unrelated type errors in `__tests__/supabase-client.test.ts`
  and `supabase-server.test.ts` predate this step, same as step 60 noted).
- The crossfade itself, the two bugs above, and the final `0.36s` timing
  were all confirmed interactively against the running dev server earlier
  in the same session that produced this step — this pass added no
  behavior change, only the constant extraction, tests, and this writeup.
