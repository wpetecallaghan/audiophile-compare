---
name: audiophile-compare-build-history-59
description: Build step 59 — fix the Dropbox clip-health blind spot in checkDirectUrl.
---

# ✅ 59 — Fix the Dropbox clip-health blind spot

**The gap, flagged while fixing step 58:** a broken or revoked Dropbox
share link can return HTTP `200` with Dropbox's own generic web-app-shell
HTML instead of a `404`. `checkDirectUrl`'s dead/ok decision is based
purely on HTTP status code — it never inspected `media_type`/content-type
on the `200` path — so a broken Dropbox link in this shape read as
`'ok'` forever, in both the daily cron (`app/api/cron/check-urls/route.ts`)
and at clip-creation time (`POST /api/clips/verify`), for any clip whose
`provider` resolves to `'direct'` via a Dropbox share URL.

**Root cause, found by testing with `HEAD`, not just `GET`:** a real,
working Dropbox `raw=1` link's `HEAD` response is a `302` that redirects
to a `*.dl.dropboxusercontent.com` CDN host, which then serves `200`. A
broken link (wrong/expired `rlkey`, or a fabricated path entirely) never
redirects at all — it gets `200` straight from `www.dropbox.com` itself,
serving the ordinary web-app shell.

**Content-type can't be used to tell these apart** — confirmed directly:
the CDN's `200` response reports `content-type: application/json` even
for a real 112MB `.mov` file (matches `detect-provider.ts`'s existing
Dropbox-branch comment, "HEAD misreports Content-Type even for raw=1" —
the general unreliable-Content-Type principle step 54 established for
Google Photos, reused for Dropbox in step 56; see that step's new
follow-up note), while the broken shell reports `text/html`. The actual
distinguishing signal is **which host serves the final response**, not
its content-type.

**Validated directly** with Node's native `fetch` (exactly what
`checkDirectUrl` uses) and the cron's actual User-Agent string — no
rate-limiting or bot-challenge differences observed:

| | Final response host (`response.url`) | Status |
|---|---|---|
| 10 distinct real, currently-`'ok'` Dropbox clips from staging | every one redirects to `*.dl.dropboxusercontent.com` | `200` |
| Wrong `rlkey` on a real file path | stays on `www.dropbox.com` | `200` |
| Entirely fabricated file id + path | stays on `www.dropbox.com` | `200` |

Testing all 10 distinct real Dropbox files then in staging (not just one)
mattered here specifically because — unlike step 58's Drive fix, where
the risk was "an already-broken clip stays undetected a bit longer" — a
wrong signal here would actively **break currently-working clips**. All
10 (and later, all 22 real Dropbox clip rows, several files reused across
multiple clips) behaved consistently. Residual, low-risk assumption: all
of them are `.mov` video files — no Dropbox-hosted audio clip exists in
staging to test the redirect behavior against a different media type;
there's no obvious reason the CDN redirect would differ by content type,
since it's Dropbox's link-resolution behavior, not content-negotiation.

## Fix

Added a Dropbox-specific check inside `checkDirectUrl`
(`lib/clips/check-url.ts`), gated so it can never affect any other
`direct`-provider host:

```typescript
if (response.ok) {
  if (isDropboxUrl(new URL(clip.canonical_url)) && !isDropboxUsercontentHost(response.url)) {
    return { url_status: STATUS_DEAD, media_type: MEDIA_TYPE_UNKNOWN, duration_ms: null }
  }
  return { url_status: STATUS_OK, media_type: resolveMediaType(contentType), duration_ms: null }
}
```

- `isDropboxUrl` (`lib/clips/detect-provider.ts`, already used by
  `detectProvider`'s own Dropbox branch) is now exported instead of
  re-derived a second time.
- `isDropboxUsercontentHost` — new local helper in `check-url.ts`, parses
  `response.url` and checks the hostname ends with
  `dropboxusercontent.com`.
- **Raw result only — no new grace-period logic.** This returns a
  one-shot `STATUS_DEAD` exactly like a `4xx` status already does; the
  cron's existing `nextUrlStatus` composition (step 50) already softens
  a single bad check to `'degraded'` before confirming `'dead'` on a
  second consecutive run. Confirmed live (see Verified below) — nothing
  about the grace period itself changed.

No migration, no RLS change, no new provider value — same "URL
interpretation fix, not a new kind of playback" character as step 56's
own Dropbox work.

## Two consequences, checked and accepted

1. **`POST /api/clips/verify` gets more accurate too, not just the
   cron.** It calls `checkDirectUrl` directly at clip-creation/replacement
   time. `components/tests/steps/StepClips.tsx` already blocks proceeding
   when `url_status === STATUS_DEAD`, and `components/clips/ClipInput.tsx`
   already renders an inline "This URL could not be reached" error for
   it — both paths exist and are exercised today for other `direct` URLs
   (e.g. a real `404`). This fix makes them correctly fire for a broken
   Dropbox link too, instead of a false "Verified — direct" success. No
   component changes needed.
2. **`lib/ingestion/extract/clip-health.ts` (forum-ingestion pipeline)
   also calls `checkDirectUrl`.** A broken Dropbox link encountered during
   extraction will now be classified `'dead'` there instead of falling
   through to its own `'unplayable'` check (`ok` + `media_type
   'unknown'`). Both `dead_clip_url` and `unplayable_clip_url` are already
   fatal issues routing straight to `broken/` — a diagnostic-label change
   only, not a functional regression. Its unit tests
   (`clip-health.test.ts`) mock `checkDirectUrl` wholesale, so they're
   unaffected either way.

## Files changed

- `lib/clips/detect-provider.ts` — exported `isDropboxUrl`.
- `lib/clips/check-url.ts` — the branch above, plus `isDropboxUsercontentHost`
  and comments explaining the signal.
- `lib/clips/__tests__/check-url.test.ts` (new) — this file had zero
  existing unit test coverage (unlike the cron route, `checkDirectUrl` is
  a pure-ish function already exercised by mocks elsewhere, e.g.
  `clip-health.test.ts` mocks it wholesale rather than testing its
  internals), so this both covers the new Dropbox branch and gives the
  previously-untested status-code/timeout/network-error paths their
  first real coverage. 11 cases: audio/video/unknown content-type on a
  `200`, `404` → dead, `500` → degraded, timeout → degraded, network
  error → dead (all pre-existing, previously-untested behavior); a
  Dropbox `200` redirected to the CDN → ok; a Dropbox `200` that never
  left `dropbox.com` → dead; a Dropbox `404`/`5xx` unaffected by the new
  branch; and a regression guard proving the redirect-host check is
  gated to Dropbox only (a non-Dropbox `200` from an unrelated redirect
  target is still trusted).
- `__claude_context__/build-history/58-google-drive-cron-health-check.md`
  — noted the Dropbox gap flagged there is now fixed here.
- `__claude_context__/build-history/56-dropbox-raw-url.md` — noted its
  "HEAD misreports Content-Type" finding is exactly why this step
  couldn't use content-type and used the redirect host instead.
- `__claude_context__/testing.md` §4 — added this file to the unit test
  inventory.

## Verified

- `npx tsc --noEmit` clean.
- `npm run test` — 50 files / 535 tests passing (11 new, no regressions).
- **Verified directly against real staging**, same manual-verification
  approach as step 58 (this cron route stays outside the integration-test
  tier — see `testing.md` §7 for why): ran the real `GET` handler
  in-process, twice.
  - First run: `{ checked: 103, updated: 1 }`; a seeded throwaway
    broken-Dropbox fixture moved `'ok' → 'degraded'`.
  - Second run: the fixture moved `'degraded' → 'dead'`, confirming the
    grace period completes correctly for this new Dropbox path exactly
    as it already does for everything else.
  - **All 22 real Dropbox clip rows in staging (10 distinct files,
    several reused across multiple clips) were re-queried after both
    runs and are still `'ok'`** — the critical regression check, given
    the asymmetric risk here (a wrong signal breaks working clips, not
    just delays detecting dead ones).
  - Called `checkDirectUrl` directly (the same function
    `POST /api/clips/verify` calls behind its session-auth check) against
    the broken Dropbox URL and confirmed it now reports `'dead'` instead
    of a false `'ok'`.
  - Fixture rows cleaned up afterward.
