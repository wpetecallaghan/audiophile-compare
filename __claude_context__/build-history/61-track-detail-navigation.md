---
name: audiophile-compare-build-history-61
description: Build step 61 — First/Previous/All/Next/Last footer navigation on the track detail page, plus a shared, unit-tested getAdjacentIds() helper extracted out of tests/[id]'s existing inline nav logic.
---

# ✅ 61 — Track detail item-to-item navigation

**The ask:** `app/tests/[id]/page.tsx` already lets a viewer step through
sibling tests with First/Previous/All/Next/Last controls in the global
footer. `app/tracks/[id]/page.tsx` had no equivalent — just a breadcrumb
back to `/tracks`. Apply the same navigation technique to track detail
pages.

Tracks are simpler than tests: `/tracks/[id]` is linked to from exactly one
place — the flat, unpaginated `/tracks` list
(`.order('artist').order('title')`) — so there's no `from`/`fromId`/`page`
searchParams branching to replicate like tests/[id] has for its three
possible origins (feed/track/system). Just one fixed order to page through.

## A gap found along the way

`FooterPortal`/`footer-nav-slot.ts`/the chevron icon set were added in an
earlier commit ("Add navigation between tests", `c0dbc31`) that never got a
`build-history/` entry at all — the pattern has been live on `tests/[id]`
this whole time without being documented in `components.md`. Since tracks
now adopts the same pattern, `components.md` gets a proper write-up for both
call sites as part of this step (§14), closing that gap rather than
perpetuating it.

## Why `getAdjacentIds` was extracted to `lib/nav/`

Copying `tests/[id]`'s inline `navIdx`/`prevId`/`nextId`/`firstId`/`lastId`
formula a second time into `tracks/[id]` would be the exact "found
duplicated across files" situation `build-history/52-componentize-page-layout.md`
already sets precedent for — extract, don't re-paste. It also crosses a
testing boundary that matters in this codebase: `testing.md §1/§4` only
unit-tests pure logic living in `lib/**`, never page components directly
(confirmed — no test file exists for `tests/[id]`'s original inline
version). Extracting the position math to `lib/nav/get-adjacent-ids.ts`
turns previously-untested, about-to-be-duplicated logic into a single,
shared, unit-tested function — `tests/[id]/page.tsx` was refactored to call
it too (same behavior, no JSX or query changes there).

## Fix

**`lib/nav/get-adjacent-ids.ts`** (new) — `getAdjacentIds(ids: string[],
currentId: string): AdjacentIds`, pure index arithmetic: `indexOf` the
current id, then `prevId`/`firstId` are `null` when already at position 0,
`nextId`/`lastId` are `null` when already at the last position (or when
`currentId` isn't found in `ids` at all — `indexOf` returns `-1`, and every
comparison against `-1` short-circuits to `null`).

**`app/tests/[id]/page.tsx`** — the five-line inline formula replaced with
`const { prevId, nextId, firstId, lastId } = getAdjacentIds(navIds, test.id)`.
The `navIds` construction above it (the three `from === 'feed' | 'track' |
'system'` branches) is untouched.

**`app/tracks/[id]/page.tsx`** — after the existing track/tests fetch,
queries `tracks` for `id` ordered `.order('artist').order('title')` (the
same shape `app/tracks/page.tsx`'s own list query uses), then calls
`getAdjacentIds(navIds, track.id)`. Renders the same five-control
`<FooterPortal>` block tests/[id] uses: First (`ChevronsLeftIcon`) /
Previous (`ChevronLeftIcon`) / All (`ListIcon`, always shown, → `/tracks`) /
Next (`ChevronRightIcon`) / Last (`ChevronsRightIcon`), each a
`<Link variant="nav" aria-label={t('nav.*')} />`. Unlike tests/[id]'s
`{navBackHref && (...)}` guard (needed there because `navBackHref` can be
`null` for an unrecognized `from`), tracks' `navBackHref` is always
`/tracks`, so the block renders unconditionally — no dead guard.

**Repeated-literal cleanup** (`repeated-string-constants.md`): the existing
breadcrumb already hardcoded `href="/tracks"`; adding the footer nav's "back
to list" link would have repeated that literal for the same reason, so both
now read from one `const TRACKS_LIST_HREF = '/tracks'`.

**`app/tracks/[id]/loading.tsx`** — confirmed to need no change. It already
matches `tracks/[id]/page.tsx`'s `<PageShell maxWidth="4xl">` exactly
(`<PageLoading maxWidth="4xl" />`, from step 60), and `FooterPortal` only
mounts its children client-side after the real page resolves — so the
loading skeleton correctly shows no nav placeholder, the same shape
`app/tests/[id]/loading.tsx` already has.

**`messages/en.json`** — added `tracks.nav.{first,previous,next,last,all}`,
mirroring `tests.nav`'s shape with track-flavored copy ("First track" not
"First item") — per-entity wording, not a shared `common.nav.*`, matching
this file's existing "each surface gets its own wording" precedent
(`components.md §10`).

## Tests

**`lib/nav/__tests__/get-adjacent-ids.test.ts`** (new, 6 tests) — the one
genuinely new piece of testable logic: an id in the middle of the list gets
all four neighbors; the first id has `prevId`/`firstId` `null`; the last id
has `nextId`/`lastId` `null`; a single-item list and an unmatched
`currentId` both resolve to all-`null`; an empty `ids` array resolves to
all-`null`.

No new tests for `app/tracks/[id]/page.tsx` or the `tests/[id]` refactor —
consistent with existing precedent: page components in this codebase are
not unit-tested (`testing.md §1`), and neither the original inline version
nor `app/tracks/page.tsx` had coverage either. Verified manually instead
(see below).

## Files changed

- `lib/nav/get-adjacent-ids.ts` (new)
- `lib/nav/__tests__/get-adjacent-ids.test.ts` (new)
- `app/tests/[id]/page.tsx` (refactor only — same behavior)
- `app/tracks/[id]/page.tsx`
- `messages/en.json` — added `tracks.nav`
- `__claude_context__/components.md` — new §14 documenting `FooterPortal`
  for both call sites (closing the undocumented-gap noted above)
- `__claude_context__/core.md` — `lib/nav/` file-layout entry, build status bump
- `__claude_context__/testing.md` — unit test inventory row

## Verified

- `npm test` — 52 files / 548 tests passing (6 new, no regressions).
- `npx tsc --noEmit` — clean on every file touched here (pre-existing,
  unrelated type errors in `__tests__/supabase-client.test.ts` and
  `supabase-server.test.ts` predate this step, same as step 60 noted).
- The already-running local dev server picked up every changed file via
  Turbopack HMR and reported `✓ Compiled` with no errors for each — no
  import/syntax/type break in `lib/nav/get-adjacent-ids.ts`,
  `app/tests/[id]/page.tsx`, or `app/tracks/[id]/page.tsx`.
  `curl http://localhost:3000/tracks` correctly 307-redirects to
  `/login?redirectTo=%2Ftracks` (middleware protection intact).
- **Not verified end-to-end in a logged-in browser** — `/tracks` and
  `/tracks/[id]` are auth-protected, and no interactive session/E2E
  credentials were available in this environment to actually click through
  First/Previous/All/Next/Last on a real track. Left as a follow-up for the
  user to confirm the on-screen behavior, same kind of gap step 60 flagged
  for its own real-device check.
