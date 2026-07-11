---
name: audiophile-compare-build-history-56
description: Build step 56 — play Dropbox-hosted clips inline via the raw=1 link; NativePlayer's fallback redesigned to remove a timeout race.
---

# ✅ 56 — Play Dropbox-hosted clips inline via the `raw=1` link

**Feature request, prompted by a real example**
(`http://localhost:3000/tests/08be3720-52b3-448e-8ff5-b6e9118ed6fc`):
Dropbox is a popular way people record and share clips; both clips in
that test were `provider: 'direct', media_type: 'unknown'`, falling back
to a link since the stored URL (`...?dl=0`) is Dropbox's HTML share page,
not a media file.

**Confirmed live, not assumed:** swapping the `dl` query param for
`raw=1` makes Dropbox serve the file bytes directly. `dl=0` in a real
`<video>` element fails instantly (`error.code 4`); the same file's
`raw=1` URL plays perfectly — `readyState: 4`, real dimensions
(1920×1080), real duration, no error. Unlike the Google Photos case from
step 54, Dropbox has a genuine direct-file escape hatch — no iframe or
SDK needed.

## Fix

**`lib/clips/detect-provider.ts`** — new hostname-matched branch
(`www.dropbox.com`/`dropbox.com`, not a specific path shape — the
rewrite is a safe no-op for anything that isn't a file link):
```ts
function toDropboxRawUrl(url: URL): string {
  const rewritten = new URL(url.toString())
  rewritten.searchParams.delete('dl')
  rewritten.searchParams.set('raw', '1')
  return rewritten.toString()   // rlkey and every other param untouched
}
```
`provider` stays `'direct'` — no new provider value, since this isn't a
different kind of playback, just a URL fix.

**Architecture already supported this with no DB migration**:
`canonical_url` is never persisted — confirmed via `app/api/tests/route.ts`
(only `source_url` is stored; comment: *"canonical_url and embed_id
aren't columns in the schema — source_url holds the original; provider
detection is re-run on display"*) and `lib/clips/to-clip-data.ts`
(`detectProvider(clip.source_url)` re-run every render). So this fix
applied automatically to the two clips already in the linked test, the
moment it shipped.

**`components/media/players/NativePlayer.tsx` / `MediaPlayer.tsx`** —
`Props.url` previously did two jobs: the `src` to actually play, and the
URL shown by `UnknownPlayer` on failure. For Dropbox these needed to
diverge — a failed clip's "open link directly" should land on Dropbox's
normal share page, not the raw stream. Added `fallbackUrl?: string`
(defaults to `url`); `MediaPlayer.tsx` passes
`url={clip.canonical_url ?? clip.source_url}` and
`fallbackUrl={clip.source_url}`. For every non-Dropbox direct clip,
`canonical_url` already equals `source_url` unchanged, so this is a
no-op there.

## Revision: the load-timeout approach itself was the real problem

Manual testing against the real Dropbox test showed intermittent false
fallbacks — one clip would occasionally show the link even though it
played fine on the very next run. Increasing `LOAD_TIMEOUT_MS` from 3s
(step 54) to 5s (your first suggestion) didn't fully fix it — a repeat
check still showed the same flakiness. Rather than tune the number
further, you proposed a different design: **show the fallback link by
default, and only swap to the player once real playback is confirmed** —
removing the timeout race entirely instead of chasing a duration that
apparently doesn't exist (no fixed wait is both short enough to not feel
broken on a dead link and long enough to never misfire on a
slow-but-working one, especially against Dropbox's CDN on a cold
connection).

**`components/media/players/NativePlayer.tsx` — full redesign:**
```tsx
const [hasLoaded, setHasLoaded] = useState(false)
useEffect(() => { setHasLoaded(false) }, [url])

const sharedProps = {
  src: url,
  controls: true,
  className: hasLoaded ? 'w-full max-w-full' : 'hidden',
  onPlay,
  onLoadedMetadata: () => setHasLoaded(true),
}

return (
  <>
    {!hasLoaded && <UnknownPlayer url={fallbackUrl ?? url} />}
    {mediaType === 'audio'
      ? <audio ref={elementRef} {...sharedProps} />
      : <video ref={elementRef} {...sharedProps} />}
  </>
)
```
No more `hasError` state, no `LOAD_TIMEOUT_MS`, no `setTimeout`/
`clearTimeout`, no `onError` handler at all. The `<audio>`/`<video>`
element is always mounted (so it can attempt loading in the background)
and visually hidden until `onLoadedMetadata` — proof real media data
arrived, since parsing HTML as a media container can't produce that
event — swaps it in and hides the link. If the element errors, or
`onLoadedMetadata` never arrives, the link was already showing and just
stays there; there's no failure state to detect or transition out of, so
there's no way to misfire in either direction. This is a strictly better
design, not a workaround: it removes an entire bug class (a real,
working file racing an arbitrary timer) rather than tuning that race's
parameters.

Re-verified against the real test 3 times in a row: both clips reach
`readyState: 4` with no fallback link visible, consistently — previously
flaky even at 5s.

## Tests

- **`lib/clips/__tests__/detect-provider.test.ts`** — new `describe('Dropbox', ...)`
  (4 cases): a `dl=0` share link (the exact shape from the real test)
  rewrites to `raw=1` with `dl` removed and `rlkey` preserved; a URL with
  no `dl` param at all still gets `raw=1` added; idempotent for a URL
  already using `raw=1`; handles bare `dropbox.com` as well as `www`.
- **`components/media/players/__tests__/NativePlayer.test.tsx`** —
  rewritten for the new design (9 cases): the fallback link shows
  immediately, before load; `<audio>`/`<video>` is mounted but hidden
  until loaded; `onLoadedMetadata` reveals the player and hides the link;
  `onPlay` fires on the play event; the link simply keeps showing if the
  element errors; `pause()` via ref doesn't throw before load; uses
  `fallbackUrl` (not `url`) for the link when they differ; resets to
  showing the link again when `url` changes.
- **`components/media/__tests__/MediaPlayer.test.tsx`** — new case:
  a direct clip's media element `src` uses `canonical_url`, not
  `source_url`, when they differ. The step 54 "not a bare link" test was
  corrected — a link is now expected by default until load confirms, so
  it now only asserts the `<video>` element is mounted.
- `__claude_context__/testing.md`, `__claude_context__/components.md §5`
  — updated to describe the new default-link, confirm-then-reveal
  design.

No E2E changes — no existing fixture uses `provider: 'direct'`
(confirmed via search), so nothing else was affected; this remains pure
URL-string computation and prop wiring, same reasoning as step 54 for
preferring unit tests here.

## Verified

- `npx tsc --noEmit` — clean (pre-existing, unrelated errors in
  `__tests__/supabase-client.test.ts` / `supabase-server.test.ts`
  confirmed present on the base branch).
- `npm run test` — 47 files / 511 tests passing.
- Full local E2E suite — 62/62 passing, re-run after the redesign.
- Manual, live Playwright verification against the real reported test,
  run 3 times in a row after the redesign — consistently both clips
  loaded with no fallback link, unlike the timeout-based version.
