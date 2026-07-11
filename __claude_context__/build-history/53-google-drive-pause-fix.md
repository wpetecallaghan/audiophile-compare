---
name: audiophile-compare-build-history-53
description: Build step 53 — fix Google Drive clips not pausing each other.
---

# ✅ 53 — Fix Google Drive clips not pausing each other

**The bug report:** on a production test with two Google Drive clips
(confirmed by pulling the page's own payload — both `provider:
'google-drive'`), starting playback of one clip didn't stop the other.

**Root cause, confirmed by reading the actual code:** `GoogleDrivePlayer.tsx`'s
`pause()` was a documented no-op (build step 34, decision 3 — Drive's
`/preview` embed has no public postMessage control API, unlike YouTube's
IFrame API or Vimeo's Player.js). That alone would only mean "can't be
paused" — the deeper issue was `onPlay` was never wired at all:
`GoogleDrivePlayer` destructured only `{ videoId }` from its props,
silently dropping the `onPlay` callback `MediaPlayer.tsx` passes it. So
`ABPlayer.tsx`'s coordinator (`handleAPlay`/`handleBPlay`, which call the
*other* player's `pause()` on every `onPlay`) never even learned a Drive
clip started — this gap existed for **any** pairing involving a Drive
clip, not just Drive-vs-Drive (a Drive clip next to a YouTube clip also
never paused the YouTube clip, since Drive's half of the handshake never
fired).

**Why this can't be a clean fix like every other provider:** no
postMessage API exists for Drive's embed — a real platform gap. Both
halves needed a different technique from every other player:
- **Stopping playback** — no pause call exists. The only way to actually
  halt Drive's embedded audio/video without a control SDK is removing the
  iframe from the DOM and remounting a fresh one (browsers immediately
  stop all content in a removed iframe) — a `key` bump, the standard
  React force-remount technique. This part was correct from the first
  attempt and never changed.
- **Detecting play** — no play event is available, and getting this half
  right took three attempts, not one. Documented in full because the
  first two both *looked* right and passed an initial automated check —
  only testing the real repeated-switching workflow caught the actual
  bugs:
  1. **`window.addEventListener('blur', ...)` + `document.activeElement`
     check.** The standard technique for "detect a click into a
     cross-origin iframe." Worked for a single click in an automated
     check — but `window.blur` only fires on the window's
     focused-to-blurred *transition*. Once focus is already inside one
     iframe, clicking directly into the *sibling* iframe doesn't refire
     `window.blur` (the window was already blurred; there's no second
     transition to detect) — so it silently stopped working after the
     first switch. Caught by extending the manual verification script to
     click A, then B, then A again, and checking each remount actually
     happened — the *actual* reported workflow (comparing two clips
     repeatedly), not a single click.
  2. **`document.addEventListener('focusin', ...)` checking `event.target`.**
     Tried next, reasoning that `focusin` fires per focused *element* and
     shouldn't have `blur`'s one-shot limitation. Turned out worse — Chromium
     does not dispatch a bubbling `focusin` event for a cross-origin
     iframe gaining focus at all, even though `document.activeElement`
     *does* update to the iframe element. 0 of 3 rounds in the same
     verification script fired at all.
  3. **Polling `document.activeElement` on an interval (200ms), diffing
     against the last observed value.** What actually works — verified
     against all three rounds of the real click-A-then-B-then-A sequence
     against the actual reported test, not just a single interaction.
     Accepted trade-off: up to ~200ms of latency before the sibling stops,
     and a lightweight interval running per Drive player instance for as
     long as it's mounted — a real cost, but the only signal that
     reliably tracks focus moving *between* two sibling iframes, which
     neither event-based approach above does for cross-origin content.

**Accepted trade-off (unchanged from the original plan):** a
force-reloaded sibling loses its playback position and resets to the
Drive thumbnail — a real UX regression versus every other provider's
clean pause/resume. Confirmed acceptable with you before implementing,
given it's the only available option.

**Fix — `components/media/players/GoogleDrivePlayer.tsx`, the only file
changed:**
```typescript
useImperativeHandle(ref, () => ({
  pause() {
    setReloadKey(k => k + 1)   // forces the iframe to unmount + remount
  },
}))

useEffect(() => {
  let lastActive: Element | null = document.activeElement
  const interval = setInterval(() => {
    const active = document.activeElement
    if (active === lastActive) return
    lastActive = active
    if (active === iframeRef.current) onPlay()
  }, 200)
  return () => clearInterval(interval)
}, [onPlay])
```
`<iframe key={reloadKey} ref={iframeRef} .../>` — the `key` bump is what
makes React discard the old DOM node and mount a fresh one. No changes
anywhere else: `MediaPlayer.tsx` already passed `onPlay` through
(`GoogleDrivePlayer` just never used it), and `ABPlayer.tsx`'s
`handleAPlay`/`handleBPlay` → sibling `.pause()` coordination already
existed and needed no changes — `GoogleDrivePlayer` was simply the one
player never correctly plugged into it.

**Tests:**
- `components/media/players/__tests__/GoogleDrivePlayer.test.tsx` (new, 4
  cases, using `vi.useFakeTimers()` to drive the poll interval
  deterministically): `onPlay` fires when focus moves into the iframe;
  doesn't fire when the active element is unrelated; **fires again on a
  second, later focus transfer into the same iframe** (the explicit
  regression guard for the exact bug the first two attempts had — focus
  away, then back, asserting `onPlay` was called twice, not once);
  `pause()` causes the rendered `<iframe>` DOM node to change identity
  (the concrete, testable signal a real remount happened, not just a
  mutated `src`).
- `components/media/__tests__/ABPlayer.test.tsx` — its existing Drive
  case asserted "the sibling pausing it is a harmless no-op," no longer
  true; renamed to a plain rendering/src smoke test, real behavior
  coverage moved to the new file above.
- `__claude_context__/testing.md` — updated both rows.

**Verified:**
- `npx tsc --noEmit` — clean.
- `npm run test` — 43 files / 486 tests passing (up from 42/482 — 4 new).
- Full local E2E suite — 62/62 passing on the final run. An earlier
  attempt (before the polling fix landed) hit 3 unrelated failures
  (`zz-sign-out`, a `delete.spec.ts` case, two `voting.spec.ts` forum-link
  cases) that all passed cleanly in isolation and don't touch media
  playback — environmental flakiness under a long sequential run, not a
  regression, confirmed by the clean re-run.
- **Manual functional check against the actual reported test**
  (`http://localhost:3000/tests/db79630e-4d55-4059-b48c-89e4d10975cd`,
  the real production URL from the bug report, run locally since this
  branch isn't deployed): a throwaway Playwright script tagged each
  iframe's DOM node with a marker attribute and clicked A → B → A,
  confirming the *sibling* lost its marker (proof of remount, since a
  `src`-string comparison alone can't detect a remount to the identical
  URL) after every single click, not just the first. **This script — not
  the automated test suite — is what caught both real bugs**; the
  original single-click check would have shipped attempt 1 believing it
  worked. Script was scratchpad-only, never committed.
- **You then reported the fix didn't work when tested manually** even
  after the above passed — the trigger for actually re-testing the
  repeated-switching workflow instead of trusting the single-click
  result. Recorded here because it's the reason this step has three
  implementation attempts in its history instead of one, and because it's
  a real instance of "the user's manual check caught what automation
  missed" (same lesson as step 52's `RowCard` alignment correction, a
  different kind of gap — that one no automated check *could* have
  caught; this one a *more thorough* automated check would have).
