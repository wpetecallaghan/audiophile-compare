---
name: audiophile-compare-build-history-55
description: Build step 55 — YouTube clips stay inline on mobile (playsinline).
---

# ✅ 55 — YouTube clips stay inline on mobile (`playsinline`)

**Mobile UX feedback (not a bug report), second of two raised together**
(the first, direct-link inline playback, is step 54): "for embedded
clips, the embed frame size makes it hard sometimes to access the
play/stop control (because the video does not shrink to fit the frame)."

**Root cause, confirmed by reading the code:**
`components/media/players/YouTubePlayer.tsx` constructed its `YT.Player`
with only `playerVars: { origin: window.location.origin }` — no
`playsinline`. This is a well-documented, specific iOS Safari behavior:
without `playsinline: 1`, tapping play on an embedded YouTube video
forces it into the device's native fullscreen video player instead of
staying inline in the page. Once fullscreen, "small frame, hard to reach
controls" follows directly — the OS's own fullscreen chrome is layered
over YouTube's controls, not the app's layout. `VimeoPlayer.tsx` already
passes `responsive: true` to the Vimeo Player SDK with no equivalent
complaint on record, so no changes there.

`playsinline` was already a typed field on `YT.PlayerVars`
(`types/youtube.d.ts`, `playsinline?: 0 | 1`) — no type changes needed.

## Fix

**`components/media/players/YouTubePlayer.tsx`** — a single config
value:
```typescript
player = new YT.Player(containerRef.current, {
  videoId,
  playerVars: {
    origin: window.location.origin,
    playsinline: 1,
  },
  events: {
    onStateChange(event) {
      if (event.data === YT.PlayerState.PLAYING) onPlay()
    },
  },
})
```

## Revision: a second, real sizing bug — found via your follow-up check

You asked me to check whether the other embedded players (Vimeo, Google
Drive) had the same class of problem. Rather than assume, I inspected
each live against a real clip (seeding a throwaway Vimeo test where none
existed, using the DB directly for Google Drive) with Playwright,
comparing the iframe's computed CSS against its wrapper under a mobile
viewport:

- **Vimeo** — no bug. `responsive: true` makes the Vimeo Player SDK
  apply its own inline `position:absolute;width:100%;height:100%` to the
  generated iframe directly, independent of our container's classes.
  Computed width correctly matched the wrapper (358px of 358px).
- **Google Drive** — no bug of *this* class, but a real, different one
  surfaced. computed iframe width matched the wrapper correctly (352px
  of 352px in Firefox at a Galaxy-S25-like viewport) — so container
  sizing itself was fine.

**But then you reported the same real Google Drive test still "does not
shrink the video render in the same way" as viewing the file directly on
Drive**, with screenshots of both. Comparing them: the embedded version
showed the video cropped tightly to fill the 16:9 frame; the direct Drive
page showed more of the same frame, less cropped. I confirmed this is
**not our CSS** by loading Drive's own `/preview` URL directly — no
wrapper, no app CSS at all — at two different container shapes; it
cropped the video to fill the box both times. Drive's `/preview` widget
crops-to-fill by design, unlike YouTube's and Vimeo's players, which
letterbox a non-matching aspect ratio instead. Since this renders inside
a cross-origin iframe, nothing on our side can change that behavior.

Per your explicit choice, this is documented as an accepted platform
limitation (no code fix — there isn't one available), extending the
existing Drive-limitations list in `GoogleDrivePlayer.tsx` and
`components.md §5` (no control SDK, force-remount pause, polled play
detection — steps 34/53) with this third item. `core.md`'s file-layout
comment for `GoogleDrivePlayer.tsx` was also out of date (still said
`pause()` is "a documented no-op," true before step 53 but not since) —
corrected while in the area.

**`components/media/players/YouTubePlayer.tsx`** — the sizing fix,
separate from `playsinline`: the container div was missing `w-full
h-full`:
```tsx
<div ref={containerRef} className="absolute inset-0 w-full h-full" />
```
The YouTube IFrame API preserves this div's className onto the `<iframe>`
it replaces it with (confirmed live — unlike Vimeo, which discards it and
applies its own inline styles instead), but without an explicit
width/height, YouTube's own default `640×360` HTML attributes won out
over `inset-0`'s stretch — a CSS rule for absolutely positioned replaced
elements: an explicit width (even from a presentational HTML attribute)
takes precedence over an `inset: 0` constraint unless the element also
has an explicit CSS width. `GoogleDrivePlayer.tsx`'s own iframe already
included `w-full h-full` for the same reason; `YouTubePlayer.tsx`'s
equivalent div didn't. Verified live: computed width went from a fixed
640px to 358px (matching the wrapper) under a mobile viewport.

## Tests

New **`components/media/players/__tests__/YouTubePlayer.test.tsx`** (no
test file existed for this component before). Mocks `window.YT` directly
before render rather than the script-injection flow —
`lib/youtube-api.ts`'s `loadYouTubeApi()` calls its ready-callback
immediately whenever `window.YT?.Player` already exists, so this is
sufficient without mocking `<script>` tag injection. One gotcha: `new
YT.Player(...)` requires the mock to be a real `function`, not an arrow
function (arrows can't be called with `new`) — the mock implementation
uses `function (...)  { ... }`.
- **The regression guard for `playsinline`**: `playerVars.playsinline`
  is `1`.
- **The regression guard for the sizing fix**: the SDK's target container
  div carries `absolute`, `inset-0`, `w-full`, and `h-full` — can't
  simulate the real IFrame API preserving those onto its generated
  iframe in jsdom (no real IFrame API runs there; that part was verified
  live via Playwright instead, see above), so this only guards the
  source classes stay correct.
- Two baseline cases, added since this file is new anyway:
  `onStateChange` with `data: PLAYING` calls the `onPlay` prop; `pause()`
  via the exposed `PlayerHandle` ref calls the SDK's `pauseVideo()`.
- `__claude_context__/testing.md` — new row. `components.md §5` and
  `core.md`'s file-layout comment — extended/corrected the
  `GoogleDrivePlayer` limitations, as above.

## Verified

- `npx tsc --noEmit` — clean (pre-existing, unrelated errors in
  `__tests__/supabase-client.test.ts` / `supabase-server.test.ts`
  confirmed present on the base branch, unrelated to this change).
- `npm run test` — 47 files / 506 tests passing (up from 46/502 before
  this step — 1 new file, 4 new tests).
- Full local E2E suite — 62/62 passing, re-run after the sizing fix.
- Manual, live Playwright verification against real clips for all three
  players (Vimeo, Google Drive, and the specific reported Google Drive
  test) — see above; a throwaway seeded Vimeo test and its fixtures were
  deleted afterward.
- Manual check: pending your confirmation on a real phone that YouTube
  embeds now stay inline and correctly sized.
