---
name: audiophile-compare-build-history-80
description: Build step 80 — Export a named constant for every ClipProvider/MediaType union member, matching the existing STATUS_OK/STATUS_DEGRADED/STATUS_DEAD precedent for UrlStatus, and fix repeated-string-constants.md's now-stale worked example.
---

# ✅ 80 — Shared constants for every `ClipProvider`/`MediaType` literal

**The request, reported directly:** a codebase search for the string
`'unknown'` (from a selection in
`app/api/tests/cross-check/route.ts:150`) turned up the literal repeated
across ~20 files as a `ClipProvider`/`MediaType` value. Investigating
further: the sibling union `UrlStatus` already solved this —
`check-url.ts` exports `STATUS_OK`/`STATUS_DEGRADED`/`STATUS_DEAD`,
imported everywhere instead of raw literals — but `ClipProvider`/
`MediaType` (`lib/clips/detect-provider.ts`) never got the same treatment
for any of their members. Confirmed directly with the user across two
follow-up questions: the fix covers every member of both unions
(`'youtube'`, `'vimeo'`, `'google-drive'`, `'direct'`, `'unknown'` for
`ClipProvider`; `'audio'`, `'video'`, `'unknown'` for `MediaType`), not
just the literal originally selected.

**A real self-correction during the investigation:** the first grep pass
used a misconfigured invocation and silently missed several files
(`lib/clips/__tests__/find-shared-clips.test.ts`, `check-url.test.ts`'s
`provider` fixtures, a `to-clip-data.test.ts` assertion, a
`next-url-status.ts` comment). Every file in the final list came from a
second, plain `grep -rn "'x'" --include="*.ts" --include="*.tsx" .`
pass, manually reviewed line by line — not carried over from the first.

**Fix:**
- `lib/clips/detect-provider.ts` — the file that already called itself
  "the canonical source for these two literal unions" (pre-existing
  header comment) now also exports one constant per member:
  `PROVIDER_YOUTUBE`, `PROVIDER_VIMEO`, `PROVIDER_GOOGLE_DRIVE`,
  `PROVIDER_DIRECT`, `PROVIDER_UNKNOWN`, `MEDIA_TYPE_AUDIO`,
  `MEDIA_TYPE_VIDEO`, `MEDIA_TYPE_UNKNOWN`. Declared `as const` rather
  than with an explicit `: ClipProvider =`/`: MediaType =` annotation
  (the `STATUS_OK: UrlStatus = 'ok'` style `check-url.ts` uses) — a
  deliberate deviation, not an inconsistency: `MediaPlayer.tsx` assigns a
  media-type literal into `NativePlayer.tsx`'s own narrower
  `'audio' | 'video'` prop type (intentionally excludes `'unknown'` — by
  the time `NativePlayer` renders, the type is always resolved). A
  `MediaType`-typed constant (which includes `'unknown'`) would fail to
  type-check there; a literal type from `as const` is assignable to both
  the wide union and any narrower one containing it.
- `lib/clips/check-url.ts` — removed its own local, unexported
  `const MEDIA_TYPE_UNKNOWN = 'unknown'` (nothing else imported it) and
  imports the shared one from `detect-provider.ts` instead, alongside the
  two new `MEDIA_TYPE_AUDIO`/`MEDIA_TYPE_VIDEO` constants used in
  `resolveMediaType()`.
- All other production consumers updated to import and use the
  constants instead of the raw literal: `app/api/tests/cross-check/route.ts`,
  `app/api/cron/check-urls/route.ts`, `components/clips/ClipInput.tsx`,
  `lib/ingestion/extract/clip-health.ts`, `lib/clips/is-unsupported.ts`,
  `lib/clips/to-clip-data.ts`, `components/media/MediaPlayer.tsx`,
  `components/media/players/NativePlayer.tsx`, `app/api/clips/verify/route.ts`,
  `lib/ingestion/scrape/fetch-oembed.ts`, `e2e/helpers/admin.ts`.
- 13 test files (unit + 3 integration + 1 e2e spec) updated the same way,
  matching the pre-existing convention of tests importing `STATUS_OK` etc.
  instead of repeating literals.

**Deliberately left untouched** (confirmed by reading each site, not
guessed):
- `lib/ingestion/extract/extract-post.ts`'s two `'unknown'` occurrences —
  a forum-username/oembed-author fallback ("we don't know this person's
  name"), same spelling, unrelated meaning. Unifying these with the
  clip-provider constant would be exactly the false-connection mistake
  `repeated-string-constants.md` warns against.
- `document.querySelector('video')`/`('audio')` in
  `NativePlayer.test.tsx`/`MediaPlayer.test.tsx` — CSS tag-name selectors
  matching a real DOM element, unrelated to the `MediaType` value.
- `check-url.ts`'s `contentType.startsWith('audio/')`/`'video/'` — MIME
  prefix strings (note the trailing `/`), a different string from the
  `MediaType` values. Only the **returned** `'audio'`/`'video'` on those
  two lines were changed.
- `NativePlayer.tsx`'s own prop type `mediaType: 'audio' | 'video'` —
  deliberately narrower than the full `MediaType` union; left as its own
  literal union rather than switched to import the wider type (see above).

**Docs:** `__claude_context__/repeated-string-constants.md`'s "Typed
discriminated-union members get the same structural exemption" section
cited this exact file/members as *not* needing extraction — true only
while the literal was repeated inside its own defining file. Corrected to
explain that cross-file reuse always supersedes the single-file exemption,
using this exact case as the worked example of why.

**Verified:**
- `npm test` — 62 files / 623 tests, all passing — identical counts to
  before (a pure literal→constant swap, no behavior change).
- `npx tsc --noEmit` — no new errors (32 pre-existing, unrelated Supabase
  mock-typing errors in `__tests__/supabase-{client,server}.test.ts`
  confirmed present before this change).
- Re-ran `grep -rn "'unknown'\|'direct'\|'youtube'\|'vimeo'\|'google-drive'\|'audio'\|'video'"`
  across the whole repo afterward and reviewed every remaining hit by
  hand: all are comments, the canonical type/constant declarations
  themselves, or one of the documented exclusions above — nothing missed.
