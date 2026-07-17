---
name: audiophile-compare-build-history-76
description: Build step 76 — Defer YouTube/Vimeo/Google Drive SDK and iframe mounting on the test-detail page until the visitor presses play (ClipFacade).
---

# ✅ 76 — Defer iframe/SDK mounting until the visitor presses play

**The problem:** the test-detail page's remaining, hardest-to-cache cost
is rendering iframes to third-party media services — mounting the
YouTube IFrame API, the Vimeo Player.js SDK, or a Google Drive `/preview`
iframe is real client-side work (script injection, SDK init, a second
network round trip) that runs on every page load regardless of whether
the visitor ever presses play, and can't be addressed by step 75's
server-side data caching at all.

**Approach:** defer mounting the real player until a real user click.
`components/media/players/ClipFacade.tsx` (new, plain presentational
component — no `forwardRef`, nothing to control yet) renders a thumbnail
+ play button in place of the real embed. `MediaPlayer.tsx` gains a local
`activated` boolean (`useState`, default `false`) and renders `ClipFacade`
instead of `YouTubePlayer`/`VimeoPlayer`/`GoogleDrivePlayer` until
clicked. Scoped to those three providers only — `NativePlayer` (`direct`
clips) has no SDK to defer and keeps its existing background-load/
reveal-on-metadata design (components.md §5) untouched.

**No ref-forwarding changes needed:** `MediaPlayer`'s existing
`innerRef`/`useImperativeHandle('pause')` pattern already no-ops
correctly when nothing real has mounted yet — `innerRef.current` stays
`null` until the real player mounts and attaches its own ref — so pausing
an unactivated clip (e.g. the sibling clip when its own facade is
clicked) was already safe with zero special-casing.

**`onActivate` fires `onPlay` immediately** (optimistic
pause-coordination for the sibling clip via `ABPlayer`'s existing
handlers), then sets `activated` — not waiting for the real player's own
async play event, since it hasn't mounted yet at the moment of the click.

**Autoplay wiring — each real player takes a new `autoplay?: boolean`
prop** (default `false`, only ever `true` once `activated`, i.e. only
ever after a real click):
- `YouTubePlayer.tsx` — `playerVars: { ..., autoplay: autoplay ? 1 : 0 }`.
- `VimeoPlayer.tsx` — `new VimeoSDK(el, { id, responsive: true, autoplay })`.
- `GoogleDrivePlayer.tsx` — appends `?autoplay=1` to the `/preview` iframe
  `src` (undocumented but observed to work; Drive's embed is already
  documented as best-effort/reverse-engineered — see components.md §5).

**Thumbnails (`ClipData.thumbnail_url`, resolved in
`lib/clips/to-clip-data.ts`):**
- **YouTube** — derived synchronously from `embed_id` alone
  (`https://img.youtube.com/vi/{embed_id}/hqdefault.jpg`), no network call.
- **Vimeo** — no predictable path; new `lib/clips/fetch-vimeo-thumbnail.ts`
  calls Vimeo's public oEmbed endpoint for `thumbnail_url` (same
  timeout/try-catch-swallow/`next: { revalidate: 86400 }` shape as
  `resolve-google-photos.ts`). Deliberately **not**
  `lib/ingestion/scrape/fetch-oembed.ts` — that module is scoped to the
  forum-ingestion pipeline (imports ingestion-only types) and doesn't
  extract `thumbnail_url` today; reusing it here would mean the live
  page-render path importing from a batch-ingestion module, the wrong
  dependency direction.
- **Google Drive** — no public thumbnail without Drive API auth.
  `thumbnail_url` resolves to `null`; `ClipFacade` renders a plain play
  button with no background image — an explicit scope reduction, not an
  oversight.

**Real bug found and fixed after implementing the above (reported
directly, reproducible: activate two Google Drive clips in sequence, both
stay audible at once):** `GoogleDrivePlayer`'s only way to stop playback
is `pause()` force-remounting the iframe via a key bump (step 53) — but
its `src` is recomputed on every render from the same `autoplay` prop,
which stays `true` for the rest of the component's life once a clip has
been activated. So the "paused" reload just autoplayed straight back into
playing — tapping clip B's facade correctly paused clip A's *old* iframe,
but the freshly remounted replacement immediately restarted itself, so
both clips ended up audible. Google Drive is the only provider affected:
YouTube/Vimeo's `pause()` calls a real SDK method on the already-mounted
player, no remount involved, so nothing recreates their iframe's src.
Fixed with a `pausedByRemount` flag in `GoogleDrivePlayer.tsx`, set the
first time `pause()` fires and checked alongside `autoplay` when building
`src` — once a clip's been paused this way, every subsequent reload omits
`?autoplay=1`, restoring the pre-step-76 behavior of landing on a paused
frame that the visitor has to click into again to resume (the same
lost-playback-position trade-off this mechanism already accepted).
Regression guards added: a unit test in `GoogleDrivePlayer.test.tsx`
(pause-triggered reload omits the query param even though `autoplay` is
still `true`) and an end-to-end one in `ABPlayer.test.tsx` (two real
Google Drive clips, activate both in sequence, assert clip A's iframe src
has lost `autoplay=1` once clip B takes over).

**Real finding — a Playwright testing-harness artifact, not a product
bug:** verifying Vimeo's autoplay via `@playwright/test`'s configured
test runner failed with a browser-reported CORS error on Vimeo's own
internal oEmbed call
(`Request header field x-vercel-protection-bypass is not allowed by
Access-Control-Allow-Headers in preflight response`). This project's
`playwright.config.ts` attaches that header to every request in the
configured browser context (for bypassing Vercel Deployment Protection
against real deployed URLs — see step 71/69's measurement work) — Vimeo's
CORS preflight response doesn't allow that custom header, so the
browser's *own* cross-origin request to Vimeo failed, unrelated to
anything this step changed. Confirmed by re-running the same click
through a raw `playwright-core` browser launch (bypassing
`playwright.config.ts`'s global headers entirely) — the real Vimeo player
iframe (`player.vimeo.com/video/{id}?autoplay=1`) mounted correctly, with
`autoplay=1` present exactly as wired above.

**Second real finding, also environment-specific, not a defect:**
end-to-end confirmation of Vimeo's actual play-through (not just the
correct iframe URL) was blocked by a Cloudflare Turnstile bot-detection
challenge inside Vimeo's player, triggered by headless-Playwright
automation — a real visitor's browser won't trigger this. YouTube's
equivalent full play-through *was* confirmed live (see Verified below);
Vimeo and Google Drive were confirmed only at the URL/param-wiring level,
which is the same mechanism already unit-tested for all three providers.

**Files updated:**
- `components/media/players/ClipFacade.tsx` (**new**).
- `components/ui/icons.tsx` — new `PlayIcon`.
- `components/media/MediaPlayer.tsx` — `activated` state, `ClipFacade`
  wiring for the youtube/vimeo/google-drive branches.
- `components/media/players/YouTubePlayer.tsx`,
  `VimeoPlayer.tsx`, `GoogleDrivePlayer.tsx` — new `autoplay` prop.
- `lib/clips/fetch-vimeo-thumbnail.ts` (**new**).
- `lib/clips/to-clip-data.ts` — resolves `thumbnail_url` per provider.
- `components/media/MediaPlayer.tsx`'s `ClipData` type — new
  `thumbnail_url?: string | null` field.
- `messages/en.json` — new `tests.clipFacade.playAriaLabel` key.
- Docs: `components.md §5` (this file's approach, inline), this file,
  `build-history/index.md`, `core.md` (§6 bump).

**Tests:**
- `components/media/players/__tests__/ClipFacade.test.tsx` (**new**) —
  thumbnail rendering, no-thumbnail (Drive) case, click calls
  `onActivate`, accessible `aria-label`.
- `components/media/players/__tests__/VimeoPlayer.test.tsx` (**new** —
  none existed before this step) — `autoplay` default/passthrough,
  `onPlay` on the SDK's play event, `pause()` via ref.
- `YouTubePlayer.test.tsx`, `GoogleDrivePlayer.test.tsx` — extended with
  `autoplay` default/passthrough assertions.
- `MediaPlayer.test.tsx` — new "lazy SDK mounting via ClipFacade" describe
  block: facade renders (not the SDK) before a click, for each of
  YouTube/Vimeo/Google Drive; clicking mounts the real player with
  `autoplay` set; direct clips are confirmed unaffected (no facade, video
  mounts immediately as before).
- `ABPlayer.test.tsx` — its existing Google Drive iframe-src assertion
  updated to click the facade first; new end-to-end regression test for
  the pause-via-remount/autoplay bug above (two real Drive clips,
  activate both, assert clip A's src has lost `autoplay=1`).
- `lib/clips/__tests__/fetch-vimeo-thumbnail.test.ts` (**new**) — success,
  missing field, non-ok response, rejected fetch, timeout (mirrors
  `resolve-google-photos.test.ts`'s shape).
- `lib/clips/__tests__/to-clip-data.test.ts` — extended: YouTube's
  synchronous thumbnail derivation (asserts zero `fetch` calls), Vimeo's
  oEmbed-derived thumbnail, Google Drive's `null` thumbnail. The whole
  file's `beforeEach` now mocks `global.fetch` by default (previously
  only the Google Photos describe block did) — Vimeo's thumbnail lookup
  needs it mocked in every test now, not just that one block, or an
  unmocked test would issue a real network request.

**Verified:**
- `npx tsc --noEmit` — no new errors.
- `npm test` — 61 files / 604 tests, all passing.
- Full local e2e suite (`E2E_BASE_URL=http://localhost:3000`), including
  a new test in `public-feed.spec.ts`'s "Anonymous clip playback" block
  confirming the facade renders with zero iframes present, then a real
  iframe appears after clicking.
- Manual, scripted browser verification (raw `playwright-core`, bypassing
  the project's Playwright config so no `x-vercel-protection-bypass`
  header leaked into cross-origin third-party requests):
  - **YouTube** — clicked the facade, then read the real embedded
    `<video>` element's `currentTime` twice, 1.5s apart (2.34s → 3.85s):
    confirms actual playback started, not just that the iframe mounted.
  - **Vimeo** — clicked the facade; confirmed the real player iframe
    mounted at `player.vimeo.com/video/{id}?autoplay=1`, i.e. the
    `autoplay` prop reaches the real SDK-constructed player. Full
    play-through wasn't confirmable headlessly (Cloudflare bot challenge,
    see finding above).
  - **Google Drive** — clicked the facade; confirmed the real iframe's
    `src` ends in `?autoplay=1` as wired.

**Repeat performance analysis:** deployed to staging as commit `341f123`.
Deployed staging only ever reflects the *latest* deploy, so there's no way
to re-run Lighthouse against the pre-step-76 state once it's superseded —
instead measured a same-machine, same-Supabase-project A/B: two local
production builds (`next build && next start`), one checked out at
`88c8858` (step 75, before this step) in a `git worktree`, one at `341f123`
(this step), both pointed at the same real staging Supabase project via the
same `.env.local`, both measured with `npx lighthouse --throttling-method=
devtools` against the same revealed two-YouTube-clip test page
(`46a8fb74-...`, chosen specifically because it has real YouTube embeds —
a `direct`-provider test page wouldn't exercise this step's change at
all):

| Metric | Before (88c8858) | After (341f123) |
|---|---|---|
| `mainthread-work-breakdown` total | 490ms | 314ms (‑36%) |
| — Script Evaluation | 288ms | 192ms |
| Bootup time | 0.3s | 0.2s |
| Network transfer (page load) | 1477 KB | 362 KB (‑75%) |
| Total Blocking Time | ~0ms | ~0ms |
| Performance score | 0.98 | 0.99 |

Total Blocking Time itself stayed ~0ms in both runs — this particular page
is light enough that neither version produces a >50ms long task, so TBT
isn't a discriminating metric here despite being the plan's original
target. `mainthread-work-breakdown` and network transfer tell the real
story: with two clips on the page, the "before" build eagerly loaded a
full YouTube IFrame API (SDK script, player CSS, embed JS, logging pings)
for *both* clips regardless of whether the visitor ever pressed play;
the "after" build's initial load fetches nothing from YouTube but a
static thumbnail image per clip, deferring the entire SDK to the first
real click — the 75% network-transfer reduction is the more visitor-
relevant number, since it's the difference between "downloads ~1.4MB of
YouTube's own JS on every page view" and "downloads two small JPEGs."
Not LCP — that page's LCP is tied to the *video file* loading once
played, per step 73's finding, a cost this step doesn't target (and LCP
was, as expected, within noise between the two runs: 1.5s vs 1.8s).
