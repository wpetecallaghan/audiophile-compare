---
name: audiophile-compare-build-history-54
description: Build step 54 — play direct-link clips inline, with graceful fallback.
---

# ✅ 54 — Play direct-link clips inline, with graceful fallback

**Mobile UX feedback (not a bug report):** for a "direct" clip (a raw
file URL, not YouTube/Vimeo/Drive), the app sent the listener to a new
tab/page just to hear it — losing `ABPlayer.tsx`'s A/B pause coordination
and requiring cumbersome back-and-forth navigation on a phone. This was
one of two mobile UX problems raised together; the other (YouTube's
mobile embed sizing / `playsinline`) is a separate step.

**Root cause, confirmed by reading the code:** `MediaPlayer.tsx` only
rendered the inline `NativePlayer` when `clip.provider === 'direct' &&
clip.media_type !== 'unknown'`. `media_type` is resolved by
`lib/clips/check-url.ts`'s `resolveMediaType()` from the HTTP
`Content-Type` header at verification time, and falls back to
`'unknown'` whenever that header is missing, wrong, or the HEAD request
was blocked — common for real-world file hosts, not proof the file can't
actually play.

## Fix

Stop pre-judging playability server-side from an unreliable header.
Always attempt `NativePlayer` for any `provider === 'direct'` clip, and
let the browser decide client-side, falling back to the existing
link-out (`UnknownPlayer`) in the same slot only if that attempt
genuinely fails.

**`components/media/MediaPlayer.tsx`** — dropped the `media_type` gate:
```typescript
if (clip.provider === 'direct') {
  return (
    <NativePlayer
      ref={innerRef}
      url={clip.source_url}
      mediaType={clip.media_type === 'audio' ? 'audio' : 'video'}
      onPlay={onPlay}
    />
  )
}
```
Unresolved `media_type` defaults to `'video'`, not `'audio'` — a
`<video>` element still plays audio-only files acceptably, whereas
`<audio>` can't render a video's picture.

**`lib/clips/is-unsupported.ts`** — since a `direct` clip is no longer
presumptively unsupported server-side, simplified to:
```typescript
export function isUnsupportedClip(clip: { provider: string }): boolean {
  return clip.provider === 'unknown'
}
```
Only a URL that never parsed at all (`lib/clips/detect-provider.ts`
confirms `provider: 'unknown'` only happens when `new URL(rawUrl)`
itself throws) is still hidden post-reveal with its link folded into
`MappingBadge`. A `direct` clip's slot in `app/tests/[id]/page.tsx` now
always renders post-reveal too — either playing inline, or showing
`NativePlayer`'s own fallback link right there, so `MappingBadge`
doesn't need to duplicate it for this case anymore.

**`components/media/players/NativePlayer.tsx`** — added a client-side
error fallback: local `hasError` state, reset on `url` change (covers
the existing replace-clip flow), rendering `<UnknownPlayer url={url} />`
in place of the media element once set.

## Revision: onError alone was flaky — found via your manual test

After the above passed the full automated suite, you tested manually and
reported the fallback was flaky, "probably due to the varying load time
for the clip." Same lesson as step 53: automated coverage passing isn't
verification against the real case.

You provided the actual URL:
`http://localhost:3000/tests/67574e59-555b-4cc4-b2ee-9a78aa6e194e`.
Querying its clips directly showed both `source_url`s were Google Photos
share links (`https://photos.app.goo.gl/...`), stored as `provider:
'direct', media_type: 'unknown'`. `curl -I -L` on the real URL confirmed
it resolves (through a redirect) to `Content-Type: text/html` — an HTML
share page, which `<video>`/`<audio>` can never play, no matter how long
you wait. `resolveMediaType()` collapses that into the same `'unknown'`
bucket as a genuinely ambiguous/missing header, so `NativePlayer` had no
way to tell "definitely not media" apart from "might work, try it."

A headless-Chromium repro against the real clip fired `onError` almost
instantly and consistently — but that timing is browser/network-specific
(you were testing on mobile), and `onError`'s promptness for this kind of
failure is a known cross-browser inconsistency, not something the app
controls. Trusting it alone means the fallback's timing (and possibly
whether it fires within any reasonable wait at all) varies by device —
exactly the "flaky" symptom reported.

**Fix — a bounded timeout backstop, cleared only by real progress:**
```typescript
const LOAD_TIMEOUT_MS = 3000
// ...
useEffect(() => {
  setHasError(false)
  setHasLoaded(false)
  timeoutRef.current = setTimeout(() => setHasError(true), LOAD_TIMEOUT_MS)
  return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
}, [url])
// ...
onLoadedMetadata: handleLoadedMetadata,   // clears the timeout, sets hasLoaded
```
`onLoadedMetadata` firing is proof the src really is playable media —
parsing an HTML page as a media container simply can't produce that
event — so once it fires, the timeout is cancelled and no longer
matters. Until then, `hasError` becomes true either from `onError` (the
fast path, still wired) or the timeout (the deterministic backstop),
whichever comes first. This bounds the worst case instead of depending
on how long a given browser takes to report failure. (Timeout value
started at 6s, tightened to 3s per your follow-up request — still
generous for real metadata to arrive, tighter on the worst-case wait for
a genuinely unplayable clip.)

Re-verified against the real clip: querying `document.activeElement`/
video state in a fresh Playwright run against
`.../tests/67574e59-555b-4cc4-b2ee-9a78aa6e194e` confirmed the fallback
link now appears reliably. The headless-Chromium timing itself was
already fast in this environment (as before), so this alone doesn't
prove the mobile-Safari flakiness is eliminated — the timeout backstop
is the correct fix for that class of "signal might not arrive promptly"
problem regardless, and you can confirm on your phone directly.

**Follow-up (same conversation, before mobile confirmation): hide the
player until it's known to work.** You asked whether the media element
should stay hidden until either the fallback fires or it loads
successfully, so a slow-to-resolve clip never briefly shows a blank or
broken-looking native player during the 3s uncertain window. Added a
`hasLoaded` state (`components/media/players/NativePlayer.tsx`): the
`<audio>`/`<video>` element stays mounted the whole time (`display:none`
doesn't stop it loading, unlike unmounting it would) but gets `className:
hasLoaded ? 'w-full max-w-full' : 'hidden'` — revealed only once
`onLoadedMetadata` fires. On error/timeout it never gets revealed at
all; the component swaps straight to `UnknownPlayer`.

## Tests

- **New `components/media/__tests__/MediaPlayer.test.tsx`** (4 cases):
  a direct clip with media_type unknown renders `NativePlayer` (a
  `<video>`), not a bare link; unresolved media_type defaults to
  `<video>` not `<audio>`; media_type audio renders `<audio>`; provider
  unknown still renders the bare link.
- **New `components/media/players/__tests__/NativePlayer.test.tsx`**
  (9 cases, `vi.useFakeTimers()`): renders `<audio>`/`<video>` per
  mediaType; onPlay fires on the element's play event; falls back on
  `onError`; `pause()` via ref doesn't throw after that fallback; falls
  back after `LOAD_TIMEOUT_MS` elapses with neither `onError` nor
  `onLoadedMetadata` (the regression guard for the Google Photos case);
  does **not** fall back once `onLoadedMetadata` has fired, even past
  the timeout (guards against false-positives on a real, just-slow file);
  the media element stays hidden (`className` includes `'hidden'`) until
  `onLoadedMetadata` fires, then reveals; never reveals when it falls
  back to the link instead.
- **New `lib/clips/__tests__/is-unsupported.test.ts`** (3 cases): true
  only for provider unknown; false for direct regardless of media_type;
  false for every embeddable provider.
- **`e2e/tests/clip-health.spec.ts`** — both `'Unsupported-playback clip
  handling'` fixtures changed from `{ clipAProvider: 'direct',
  clipAMediaType: 'unknown' }` to `{ clipAProvider: 'unknown' }`, since
  a `direct` clip is no longer presumptively unsupported. Still exercises
  the real "provider never resolved" path end to end.
- `__claude_context__/testing.md`, `__claude_context__/components.md §5`
  — updated.

## Verified

- `npx tsc --noEmit` — clean (pre-existing, unrelated errors in
  `__tests__/supabase-client.test.ts` / `supabase-server.test.ts`
  confirmed present on the base branch too, via `git stash`).
- `npm run test` — 46 files / 502 tests passing (up from 43/486 before
  this step — 3 new files, 16 new tests).
- Full local E2E suite — 62/62 passing (re-run after each revision).
- Manual check against the real reported test, after both the
  timeout-backstop and hide-until-loaded revisions (see above).
