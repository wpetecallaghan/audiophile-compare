---
name: audiophile-compare-build-history-50
description: Build step 50 — fix false-positive "dead" clips from the URL health-check cron.
---

# ✅ 50 — Fix false-positive "dead" clips from the URL health-check cron

**The bug report:** a production test
(`https://audiophile-compare.uk/tests/2f8d546a-deaa-40f1-81ab-3f19cee06cc7`)
showed a clip as broken, but the direct URL played fine when opened by
hand. Both clip URLs (`https://lejonklou.com/1.MOV`, `.../2.MOV`) were
pulled straight from the page's own payload — source URLs are sent to the
client for playback even on a blind test, only the A/B mapping is hidden
— and both returned clean `200`/`206` on direct HEAD/ranged-GET testing.
The files were never actually gone.

**Root cause, evidenced, not guessed:** `lejonklou.com`'s response headers
(`server: cloudflare`, `x-turbo-charged-by: LiteSpeed`, `vary:
User-Agent`) show a Cloudflare-fronted shared host whose caching/bot layer
explicitly varies by User-Agent. The step 10 cron's `fetch()` HEAD request
runs from Vercel's serverless infrastructure with **no `User-Agent` header
at all** — Node/undici's default `fetch` sends none — exactly the
fingerprint Cloudflare's bot-mitigation is built to challenge (typically a
`403`), while ordinary browser traffic (and plain `curl`, confirmed
working) sails through untouched. The classic "uptime checker says down,
browser says fine" pattern for any Cloudflare-proxied origin.

**The header alone would just be an occasional blip — the real bug was
`checkDirectUrl`'s all-or-nothing status mapping.** Any `4xx` response was
mapped straight to `'dead'` in a single check
(`lib/clips/check-url.ts`, `response.status >= 500 ? 'degraded' :
'dead'`), no retry, no distinction from a resource that's actually gone.
`build-history/27-verified-broken-clip-urls.md` deliberately built
`'degraded'` as the "maybe transient, don't punish the listener" state —
voting stays open, only a soft notice — specifically for timeouts and
`5xx`s, but that tolerance was never extended to `4xx`, which is exactly
what a bot-challenge returns. One bad HEAD check flipped the clip straight
to `'dead'`: voting blocked, amber warning shown, "Broken" badge
everywhere — matching the report exactly.

**Fix — reuse the existing 3-state enum, no schema change:**

1. **One-day grace period.** New pure function,
   `lib/clips/next-url-status.ts`:
   ```typescript
   export function nextUrlStatus(current: UrlStatus, rawCheck: UrlStatus): UrlStatus {
     if (rawCheck !== 'dead') return rawCheck
     return current === 'ok' ? 'degraded' : 'dead'
   }
   ```
   A bad check only ever demotes by one step per cron run (`ok →
   degraded`); a *second* consecutive bad daily check is required to
   actually reach `dead` (`degraded → dead`). A successful check always
   recovers to `ok` immediately — no grace period needed on the way up.
   The cron already re-checks every `direct` clip daily regardless of
   status (per step 27's own note), so this falls directly out of that:
   a persistently-dead URL still reaches `dead` within two days; a
   one-off false positive self-heals on the next successful check.
   Composed in the cron route (`app/api/cron/check-urls/route.ts`) with
   `checkDirectUrl`'s existing per-check output — `checkDirectUrl` itself
   only ever sees one fetch in isolation, so the history-aware decision
   belongs in the route, which already has the clip's current status from
   its own query.
2. **Descriptive `User-Agent`** on the outbound HEAD request
   (`AudiophileCompare-URLHealthCheck/1.0
   (+https://audiophile-compare.uk)`) — standard etiquette, and removes
   the single most common trigger for this class of bot-mitigation false
   positive. A real, cheap mitigation, not a guaranteed fix (some
   bot-management fingerprints below the HTTP header layer).
3. **Not switching HEAD to a ranged GET** — direct testing showed HEAD and
   a ranged GET behave identically from a normal vantage point; no
   evidence the method itself is the differentiator (more likely *who's
   asking*), so changing it would add complexity/bytes-transferred with no
   evidence of benefit. Considered, deliberately not done.

**Files changed:**
- `lib/clips/check-url.ts` — exported `UrlStatus` as a named type (was an
  inline literal); added the `User-Agent` header; exported `STATUS_OK`/
  `STATUS_DEGRADED`/`STATUS_DEAD` as the canonical constants for each
  status literal (each now used more than once across this file and
  `next-url-status.ts`, per `repeated-string-constants.md` — "repeats
  across multiple files → a shared module"), plus a local
  `MEDIA_TYPE_UNKNOWN` for the twice-repeated `'unknown'` media type.
- `lib/clips/next-url-status.ts` (new) — the function above, built on
  those same shared constants rather than its own literals.
- `app/api/cron/check-urls/route.ts` — composes `nextUrlStatus` with
  `checkDirectUrl`'s result instead of writing the raw check straight
  through.

No migration/RLS/UI change — `'degraded'`'s existing rendering
(`messages/en.json`'s `clipHealth.degradedWarning`: "may be temporarily
unreachable — this can be intermittent") already fits this new use case
correctly as-is.

**Tests:** `lib/clips/__tests__/next-url-status.test.ts` (new) — all 9
`(current, rawCheck)` combinations; only `(ok, dead) → degraded` differs
from a naive passthrough, the other 8 confirm nothing else regresses. No
new test for `checkDirectUrl`'s `User-Agent` addition (network-touching,
untested/E2E-only, matching existing precedent) or for the cron route
itself (its only meaningful logic is now the extracted, unit-tested
`nextUrlStatus`; the route stays unchanged glue).

**Verified:** `npx tsc --noEmit` clean. `npm run test` — 41 files / 469
tests passing (up from 40/460 — the 9 new). Full local E2E suite (`npx
playwright test`) — 62/62 passing, no regressions (`clip-health.spec.ts`
seeds `url_status` directly via `seedClip`'s override, doesn't go through
the cron, so it's unaffected by this change).

**Not part of this code change:** the two clips on the reported test are
`'dead'` in the production DB right now, written before this fix existed.
The fix only changes how *future* cron runs classify results — it doesn't
retroactively correct rows already written. The next successful daily
cron run (02:00 UTC) will set them back to `'ok'` immediately once this
ships to production; a raw `'ok'` check always recovers instantly.
