---
name: audiophile-compare-build-history-34
description: Build step 34 — Google Drive clip provider support.
---

# ✅ 34 — Google Drive clip provider support

**The gap this closes:** real sampling for step 35 (extraction)'s design
found that Google Drive, Google Photos, and iCloud shared links now
dominate real clip-sharing in the forum (74 + 52 + 17 links vs. 3 YouTube,
in a 978-post recent sample) — none recognized by `detectProvider()`, all
falling into `unknown` (bare-link fallback, no embedded playback). This
isn't ingestion-specific — it affects any user pasting a Drive link into a
test they create live, not just imported content — so it's its own step,
not folded into extraction.

**Decisions:**

1. **Add Google Drive as a first-class provider; leave Google Photos and
   iCloud as `unknown`, by design, not as a remaining gap.** Drive share
   links have a stable, well-known embeddable form
   (`drive.google.com/file/d/{id}/preview`) — confirmed directly (fetched
   a real sampled link's preview URL: `200`, no `X-Frame-Options` or
   `frame-ancestors` CSP directive blocking embedding, real video title in
   the response). Google Photos and iCloud shared albums have no
   equivalent public, stable, embeddable URL designed for third-party use
   — both are consumer gallery viewers that can change format without
   notice. Screen-scraping a fake embed out of either would be fragile
   (breaks silently whenever Google/Apple tweak markup) and isn't worth
   building; their existing `unknown`-provider bare-link treatment (steps
   27/28) is the correct, honest answer given the platforms don't offer
   anything better — not a workaround to eventually fix.

2. **No health verification for Drive, matching the existing YouTube/Vimeo
   precedent exactly.** Neither YouTube nor Vimeo links are health-checked
   today — `detectProvider` returns immediately with no reachability
   check; only `provider = 'direct'` gets the cron's HEAD-request
   verification. A dead embed just shows the provider's own "video
   unavailable" state inside the iframe, an already-established,
   acceptable UX. Drive gets the identical treatment — no Drive API key,
   no Google Cloud project, no custom verification logic.

   **Revisited at step 58**, following a real production report of a test
   whose two Drive files had been deleted but showed no "Broken" badge
   anywhere: the "shows its own broken state in-iframe" reasoning only
   covers a visitor who opens the test page directly — it does nothing
   for the feed/track/system list surfaces, whose badge is driven purely
   by `clips.url_status`, which a never-checked provider can never reach
   `'dead'` in. Unlike YouTube/Vimeo, Drive's `/preview` endpoint's HTTP
   status *does* distinguish reachable from gone, so step 58 added
   `google-drive` to the cron's checked providers — see
   `build-history/58-google-drive-cron-health-check.md`. Decisions 1, 3,
   4, and 5 below are unaffected.

3. **Real, load-bearing constraint: Drive's `/preview` iframe has no
   public JS SDK for programmatic control — no play-event detection, no
   `pause()` capability.** Unlike YouTube (IFrame API) and Vimeo
   (Player.js), Google doesn't publish an embed-control API for Drive.
   This means a Drive clip cannot participate in `ABPlayer`'s "pause the
   sibling clip when one starts playing" coordination — playing a Drive
   clip won't auto-pause a concurrently-playing YouTube/Vimeo/native
   sibling, and vice versa. `GoogleDrivePlayer` still forwards a
   `PlayerHandle` ref (for type consistency with every other player, per
   `components.md` §5's "all player components use forwardRef" rule) but
   its `pause()` is a documented no-op — the same graceful-no-op behavior
   `UnknownPlayer` already exercises today when a sibling tries to pause
   it. This is an honest, real limitation, not hidden behind a
   pretend-working implementation.

4. **`clips.provider` CHECK constraint needs a migration** —
   `('youtube', 'vimeo', 'direct', 'unknown')` → adding `'google-drive'`.
   Every hardcoded provider union type in the codebase needs the same
   addition (`lib/clips/detect-provider.ts`, `components/media/
   MediaPlayer.tsx`, `app/api/tests/route.ts`, `lib/types/
   test-creation.ts`, `e2e/helpers/admin.ts`) — no single shared type
   alias exists today, so this is repeated by hand at each site, matching
   how the existing four values are already handled.

5. **`POST /api/clips/verify` and `lib/clips/is-unsupported.ts` need zero
   changes.** The verify route already has a generic "trust the URL
   pattern, `url_status: 'ok'`" branch for anything that isn't `direct`
   — Drive falls into it automatically once `detectProvider` recognizes
   it. `isUnsupportedClip` only checks for `provider === 'unknown'` or
   `(direct, media_type unknown)` — Drive is neither, so it's
   automatically treated as supported without touching that file.

**Files updated:**
- `supabase/migrations/20260707191616_clips_google_drive_provider.sql`
  (new) — drops and recreates `clips_provider_check` to allow
  `'google-drive'`. Applied to staging only, not yet production; verified
  directly via the Management API (`pg_get_constraintdef`) that the new
  value is present.
- `lib/clips/detect-provider.ts` — `extractGoogleDriveId` (matches
  `/file/d/{id}`, deliberately not `/drive/folders/...`), a new
  `google-drive` branch returning `media_type: 'video'` (matching the
  youtube/vimeo precedent, and the one inspected real sample being a
  `.mov` file) and canonical `/file/d/{id}/preview` URL.
- `lib/clips/__tests__/detect-provider.test.ts` — 3 new cases (standard
  share URL, already-embedded preview URL, folder link not misdetected).
- `lib/clips/__tests__/to-clip-data.test.ts` — 1 new case confirming
  `embed_id`/`canonical_url` derivation for the new provider.
- `components/media/players/GoogleDrivePlayer.tsx` (new) — iframe embed,
  `forwardRef` + `useImperativeHandle` per the established pattern,
  documented no-op `pause()`.
- `components/media/MediaPlayer.tsx` — new provider branch; `ClipData`
  provider union extended.
- `components/media/__tests__/ABPlayer.test.tsx` — 1 new case: a Drive
  clip renders the correct iframe `src`, and rendering alongside a sibling
  doesn't throw.
- `app/api/tests/route.ts`, `lib/types/test-creation.ts`,
  `e2e/helpers/admin.ts` — provider union types extended (no single
  shared type alias exists for this union today, so each site is updated
  by hand, matching how the original four values are already handled).
- `__claude_context__/components.md` §5 — `ClipData` canonical definition,
  the new player, and its documented no-pause limitation.
- `__claude_context__/audiophile-compare-schema.md` — `clips_provider_check`
  updated; new "Google Drive clip provider (step 34)" section.
- `__claude_context__/testing.md` — updated test counts and rows.
- `__claude_context__/build-history-ingestion/35-extraction-decisions.md` —
  decision 12's clip-health caveat updated: Drive is resolved, Photos/
  iCloud remain open by design, not as a gap.
- `__claude_context__/core.md` — build status line.

**Tests:**
- **Unit:** `detect-provider.test.ts` (3 new), `to-clip-data.test.ts` (1
  new) — Drive URL recognized, file ID extracted, canonical `/preview`
  URL constructed; a Drive *folder* link isn't misdetected as a file.
- **Component:** `ABPlayer.test.tsx` (1 new) — a Drive clip renders an
  iframe with the correct `src`, and rendering it alongside a sibling
  clip doesn't throw (the no-op-pause path).
- **E2E:** none — no new user-facing flow, just a new embed type an
  existing flow can now render.

**Verified:**
- `npm run test` — 29 files / 314 tests, all passing (6 new). `npx tsc
  --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step).
- **Confirmed the core technical assumption directly against a real
  sampled Drive link before writing any code**: fetched
  `drive.google.com/file/d/{id}/preview` — `200`, no `X-Frame-Options` or
  `frame-ancestors` CSP directive, real video title in the response
  (`"A.mov - Google Drive"`) — the embed genuinely works, not assumed.
- Migration applied to staging; `clips_provider_check`'s new definition
  confirmed directly via the Management API.
