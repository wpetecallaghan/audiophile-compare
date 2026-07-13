---
name: audiophile-compare-build-history-62
description: Build step 62 — SignOutButton no longer imports the browser Supabase SDK; auth.signOut() moved into a new app/auth/signout/route.ts, called via fetch(), removing ~65 KiB of unused JS from every anonymous page load.
---

# ✅ 62 — Sign out via a server route instead of the browser Supabase SDK

**The ask:** a PageSpeed/Lighthouse mobile audit of the production homepage
flagged LCP failing at 4.3s, 87% of which was "Render Delay". Find and fix the
root cause.

## How this was found

The LCP element itself was plain hero text, not an image, so the delay traced to
JS parse/execute cost under Lighthouse's mobile CPU throttling rather than
network or image loading. The `unused-javascript` audit pointed at one 65 KiB
chunk with 0% code coverage on that page load. Downloading that exact chunk from
the deployed site and grepping it for library signatures turned up
`GoTrueClient`, `auth-js`, `realtime-js` — the Supabase **browser** SDK, not
anything media- or UI-related. Grepping the codebase for importers of
`lib/supabase/client.ts` traced it to `components/SignOutButton.tsx`, rendered
conditionally inside `SiteHeader.tsx` (root layout, every route):

```tsx
{user ? (
  <nav>...<SignOutButton /></nav>
) : (
  <Link href="/login">Sign in</Link>
)}
```

Because `SignOutButton` was a static top-level import, Next.js bundles its whole
dependency chain into the page's client JS regardless of which branch the server
actually renders — the bundler doesn't know at build time whether a given
request will have `user` set. PageSpeed always crawls anonymously, so `user` is
always `null` there: the entire Supabase browser SDK downloaded, 0% of it ran.

## Why only auth pages need this, and how that was confirmed

Before changing anything, grepped every importer of `lib/supabase/client.ts`
project-wide: exactly eight files, all auth forms — `SignOutButton`,
`LoginForm`, `RegisterForm`, `LoginWithPasswordForm`, `ForgotPasswordForm`,
`ChangeEmailForm`, `ChangePasswordForm`, `OAuthButtons`. Every other client-side
mutation in the app (`VoteForm`, `RevealButton`, `DeleteTestButton`,
`CreateTestForm`, `AddSnapshotForm`, `SnapshotSection`, etc.) already goes
through this app's own `app/api/*` Route Handlers via `fetch()` and never
touches Supabase directly from the browser — confirmed by reading
`VoteForm.tsx`/`RevealButton.tsx`: no Supabase import in either. So the browser
SDK was never structurally necessary outside auth flows; `SignOutButton` was the
one place doing a client-side SDK call for something (`auth.signOut()`) with no
actual interactive/live requirement, unlike an OAuth redirect or a live
password/email update, which genuinely need the browser SDK. After this step,
the browser SDK is scoped to exactly the pages that render those eight
components (`/login`, `/register`, `/profile`) instead of leaking into the
global header on every route, including the feed and every test detail page.

## Why a Route Handler + `fetch()`, not a Server Action

This codebase has zero existing Server Actions (`grep "'use server'"` across the
repo returns nothing) — every mutation goes through `app/api/*` or `app/auth/*`
Route Handlers called via `fetch()` from a `'use client'` component, e.g.
`components/tests/DeleteTestButton.tsx`. A Server Action would have solved this
one bundle-size problem while adding a second, inconsistent pattern for the next
person to choose between, so the existing convention was matched instead.

## Fix

**`app/auth/signout/route.ts`** (new) — grouped with the existing
`app/auth/callback/route.ts` and `app/auth/confirm/route.ts` (auth-flow routes,
not `app/api/`). Unlike those two (browser-navigated GET links that redirect),
this one is `fetch()`-invoked from a client component, so it follows
`api-conventions.md`'s JSON response convention: gets the server Supabase client
(`lib/supabase/server.ts`), calls `supabase.auth.signOut()` with no scope
(defaults to `'global'` — same as the browser client, preserving the session
revocation `e2e/tests/zz-sign-out.spec.ts` relies on), returns
`NextResponse.json({}, { status: 200 })`.

**`components/SignOutButton.tsx`** — same shape, same UX (`useState` pending
flag, disabled button, "Signing out…" label all unchanged). `handleSignOut` now
does `await fetch('/auth/signout', { method: 'POST' })` instead of importing
`lib/supabase/client` and calling the browser SDK directly, then keeps the
existing `window.location.href = '/'`. Dropping that import is the actual fix —
it's what was pulling the SDK into the bundle.

## Tests

**`components/__tests__/SignOutButton.test.tsx`** — same three tests (renders
the button; calls the sign-out endpoint on click; navigates to `/` after it
resolves; shows disabled "Signing out…" while in flight), with the
`vi.mock('@/lib/supabase/client', ...)` mock replaced by a `vi.stubGlobal(
'fetch', mockFetch)` mock — matching how other fetch-driven client components
in this suite are tested (`ProfileForm.test.tsx`).

**`e2e/tests/zz-sign-out.spec.ts`** — no behavioral change (still a real click
on a button with the same accessible name), only its header comment updated to
point at `app/auth/signout/route.ts` instead of describing a direct
`supabase.auth.signOut()` call from `SignOutButton.tsx` — the `'global'`-scope
rationale for the file's `zz-` ordering still holds, since the route handler
still calls `signOut()` with no scope override.

## Files changed

- `app/auth/signout/route.ts` (new)
- `components/SignOutButton.tsx`
- `components/__tests__/SignOutButton.test.tsx`
- `e2e/tests/zz-sign-out.spec.ts` (comment only)
- `__claude_context__/core.md` — new `app/auth/signout/route.ts` file-layout
  entry, build status bump
- `__claude_context__/build-history/index.md` — row for step 62

## Explicitly out of scope

- `LoginForm`, `RegisterForm`, `OAuthButtons`, `LoginWithPasswordForm`,
  `ForgotPasswordForm`, `ChangeEmailForm`, `ChangePasswordForm` — all genuinely
  need the browser SDK for live/interactive auth flows. Not touched.
- No `next/dynamic` code-splitting fallback — removing the import outright
  ships strictly fewer bytes than deferring it.

## Verified

- `npm test` — full suite passing, `SignOutButton.test.tsx` green with the new
  fetch mock, no regressions elsewhere.
- `npx tsc --noEmit` clean.
- `grep "from '@/lib/supabase/client'"` now returns only the eight genuinely
  interactive auth-form files listed above — `SignOutButton.tsx` no longer
  among them.
