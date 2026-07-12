---
name: audiophile-compare-build-history-58
description: Build step 58 — extend the URL health-check cron to cover Google Drive clips.
---

# ✅ 58 — Extend the URL health-check cron to cover Google Drive clips

**The bug report:** a production test
(`https://audiophile-compare.uk/tests/929e875d-9609-4d38-8af8-ea6cdf62236e`)
showed unreachable clips, but neither the feed, the track page, nor the
system page flagged it as broken. Both clips are `provider = 'google-drive'`
and both underlying Drive files had been deleted — confirmed directly:
`https://drive.google.com/file/d/{id}/view` and `.../preview` both return
`404` with Google's own "Sorry, the file you have requested does not
exist" page.

**Root cause:** the step 10 cron (`app/api/cron/check-urls/route.ts`) only
ever queried `clips` where `provider = 'direct'` — a deliberate step 34
decision 2 call ("no health verification for Drive, matching the existing
YouTube/Vimeo precedent exactly... a dead embed just shows the provider's
own broken state inside the iframe"). Every "Broken" badge (feed,
`/tracks/[id]`, `/systems/[id]`) and `POST /api/votes`'s vote-blocking
check are driven purely by `clips.url_status`, so a clip whose provider is
never checked can never become `'dead'`. That reasoning holds for a
visitor who opens the test page directly (Drive's own broken-embed state
does show inside the iframe), but does nothing for the list surfaces,
which never render the iframe at all — exactly the gap this report
exposes.

**Verified the fix before writing it, against a known-good example
(`https://audiophile-compare.uk/tests/9c617d3a-46a7-4d49-9196-c591f87d2853`,
still live):**

| | HEAD `/preview` | GET `/preview` |
|---|---|---|
| Known-good clip (prod, still live) | `200` | Real title: `"C Spooky.wav - Google Drive"` |
| Broken clip (this bug) | `404` | `"Sorry, the file you have requested does not exist"` |

Re-tested both with the cron's actual identifying User-Agent string
(`AudiophileCompare-URLHealthCheck/1.0`, added by step 50) and with three
rapid repeat requests — same results, no rate-limiting or bot-blocking
observed on `drive.google.com`. Unlike YouTube/Vimeo (whose embed pages
return `200` regardless of whether the specific video exists — the reason
they stay excluded), Drive's `/preview` endpoint's HTTP status genuinely
distinguishes reachable from gone.

**Checked whether the same gap exists for Dropbox or Google Photos clips**
(both stored as `provider = 'direct'`, already inside the cron's existing
query):
- **Google Photos — no gap.** A real live Photos short link from staging
  (`https://photos.app.goo.gl/SegSMisnsDRdnzHT6`) returns `302 → 200`; a
  fabricated one returns `404`. `fetch` follows redirects by default, so
  `checkDirectUrl` already sees the true final status.
- **Dropbox — a different, pre-existing gap, deliberately not fixed
  here — addressed in step 59.** A real staging Dropbox link with a corrupted `rlkey` (simulating
  a broken/revoked share) returned `200` with Dropbox's generic web-app
  shell (`content-type: text/html`), not a `404`. `checkDirectUrl`'s
  dead/ok decision is based purely on HTTP status code — it never
  inspects `media_type`/content-type when the status is `200` — so a
  broken Dropbox link in this shape reads as `'ok'` forever, today,
  independent of this step. Same failure mode `lib/ingestion/extract/
  clip-health.ts` already documents for Dropbox in the ingestion pipeline
  ("a healthy `200 text/html` response — reachable, but not a playable
  media file"), but the live app's cron has no equivalent tightening.
  Fixing it means changing `checkDirectUrl`'s classification itself
  (treating a `200` with non-media content-type as dead/degraded for
  *any* `direct` clip) — a materially larger, riskier change than a query
  filter, touching every existing `direct` clip's classification
  (Dropbox, Google Photos, any other direct host). **Flagged as a known
  follow-up, not addressed in this step** — the actual signal that turned
  out to work is different from content-type entirely; see
  `build-history/59-dropbox-cron-health-check.md`.

**One documented tension, flagged but not reconciled here:**
`lib/ingestion/extract/clip-health.ts` (the forum-ingestion pipeline, a
separate subsystem) claims Drive health is "unverifiable" anonymously —
"a confirmed-broken (deleted) file id and a still-unreviewed one both
returned an identical anonymous 404." That conclusion is about vetting
scraped, third-party candidate URLs *before* a human ever confirmed they
play — a "still-unreviewed" file may never have been shared "anyone with
the link" in the first place, which 404s anonymously for a completely
different reason than deletion. Monitoring clips already live in the app
is a different situation: a real user already confirmed they play, and
the embed must be shared "anyone with the link" for it to work for
*other* visitors at all, so a 404 there reliably means something changed.
Not touched — different subsystem, different use case — but worth a
future maintainer's look if it turns out `checkClipHealth`'s "unverifiable"
call needs revisiting too.

**Fix — reuse the existing primitives, no new health-check logic:**

`detectProvider()` already resolves a Drive clip's `canonical_url` to its
`/preview` form; `checkDirectUrl()` just HEADs `canonical_url` and
classifies the response — despite its name it makes no provider-specific
assumptions; `nextUrlStatus()` (step 50's one-day grace period) is
already provider-agnostic. The only change needed was which clips the
cron's query pulls in:

```typescript
const CHECKED_PROVIDERS: ClipProvider[] = ['direct', 'google-drive']
const { data: clips, error } = await supabase
  .from('clips')
  .select('id, source_url, url_status, media_type')
  .in('provider', CHECKED_PROVIDERS)
```

**Why the existing media_type guard already makes this safe:** the cron's
loop only updates `media_type` when the check reports something other
than `'unknown'`. Drive's `/preview` page is always served as
`text/html`, which `checkDirectUrl` resolves to `'unknown'` — so the
guard is always false for Drive and `media_type` (correctly `'video'`) is
never touched, whether the check comes back ok or dead.

**Files changed:**
- `app/api/cron/check-urls/route.ts` — query filter broadened via a
  locally-typed `CHECKED_PROVIDERS` constant (single use site, so no
  shared module — see `repeated-string-constants.md`); top comment and a
  new inline comment at the `checkDirectUrl` call updated to explain
  Drive's inclusion and why it's safe. `checkDirectUrl` itself was not
  renamed despite now covering a non-direct provider — it makes no
  provider-specific assumptions today, and renaming would be a larger
  diff for a documentation-only concern; its only two other call sites
  (`app/api/clips/verify/route.ts`, `lib/ingestion/extract/clip-health.ts`)
  are unaffected.
- `__claude_context__/audiophile-compare-schema.md` — "Google Drive clip
  provider (step 34)" section corrected (no longer claims Drive is
  "never touched by the step 10 cron"); also corrected an unrelated,
  pre-existing stale claim spotted in the same paragraph while editing it
  ("Google Photos... remain `unknown` by design" — no longer true since
  `lib/clips/resolve-google-photos.ts` was added, undocumented by any
  build-history step so far).
- `__claude_context__/build-history/34-google-drive-clip-provider.md` —
  decision 2 annotated as revisited here; decisions 1/3/4/5 unaffected.

**Tests:** no unit-test changes — `checkDirectUrl`/`nextUrlStatus`/
`detectProvider`'s logic isn't changing, and all three are already
covered. No new automated test added for the cron route itself. A
committed integration test (the tier `erase-user-data`/`claim` already
use for other header-secret-authenticated admin/cron routes) was
considered and deliberately rejected: unlike those two, which only touch
the rows they create via a scoped `.rpc()` call, this cron's query has no
scoping at all by design ("regardless of test status," step 10) — it
processes *every* checkable clip in the database. Actually invoking the
route confirmed this against real staging: **103 real clips checked in
~65 seconds** (46 direct + 56 google-drive + 1 seeded fixture), which
would make a committed test both far slower than `vitest.integration.config.ts`'s
30s `testTimeout` and broad enough to mutate every real clip in staging
on every `npm run test:integration` run — not a cost worth paying for a
query-filter change with no other new logic. Stays manually-verified,
same precedent `lib/ingestion/extract/clip-health.ts`'s equivalent Drive
claim already uses for the same reason.

**Verified directly against real staging** (seeded a throwaway `[E2E]`-
prefixed test with a `google-drive` clip pointed at a syntactically-valid,
permanently-nonexistent Drive file id, then called the route handler
in-process):
- First run: `{ checked: 103, updated: 19 }`; the fixture's fake-dead clip
  moved `'ok' → 'degraded'` (the grace period's first step), `media_type`
  unchanged at `'video'`; a real, already-existing `'ok'` Drive clip in
  staging was confirmed untouched.
- Second run (simulating the next day): the fixture's clip moved
  `'degraded' → 'dead'`, confirming the two-run grace period completes
  correctly for Drive exactly as it already does for `direct`.
- Fixture rows cleaned up afterward.
- **The originally-reported test's two clips were re-queried after both
  runs and are now `url_status: 'dead'`, `media_type: 'video'`** —
  confirms the fix resolves the actual reported bug, not just a synthetic
  fixture.
- `npx tsc --noEmit` clean; full existing unit suite unaffected (no
  logic changed in any unit-tested function).

**Rollout note:** the existing grace period means any Drive clip that's
*already* dead when this cron first runs against it (this bug's test
included, before the manual verification above ran the route twice)
won't reach `'dead'` — and won't show "Broken" — until the *second* run
that checks it, up to ~48h apart on the real daily schedule. This matches
exactly how a `direct` clip already behaves today; no special-casing to
fast-track existing bad clips was added.
