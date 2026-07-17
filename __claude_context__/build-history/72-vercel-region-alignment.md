---
name: audiophile-compare-build-history-72
description: Build step 72 — Pin Vercel Functions to lhr1 (London) to align with both Supabase project regions.
---

# ✅ 72 — Align Vercel Function region with Supabase

**The gap this closes:** no `regions` was configured in `vercel.json`, so
Vercel Functions ran wherever the account/project default placed them.
Both Supabase projects are in Europe (staging `eu-west-1` Ireland,
production `eu-west-2` London, confirmed via `supabase projects list`) —
a mismatched function region would add real cross-region latency to
every DB round trip, on top of step 69's own investigation finding LCP on
both the feed and test-detail pages dominated by a multi-second "Render
Delay" phase (the time between first byte and the real streamed content
painting) that's far larger than this app's own measured server-side
data-fetching time.

**Measured first, not guessed:** the deployed staging URL's `x-vercel-id`
response header was inspected directly:
```
x-vercel-id: lhr1::iad1::l2zxn-1784294035538-a607794cd1f3
```
Format is `<edge-routing-region>::<function-execution-region>::<request-id>`
— confirming the request was routed through Vercel's edge in `lhr1`
(London, correctly closest to a UK-based request) but the actual
**function executed in `iad1` (US East, Virginia)** — a real transatlantic
hop to reach either Supabase project on every single database round trip.

**The fix:** `vercel.json` — added `"regions": ["lhr1"]`. `lhr1` is exact
for production (`eu-west-2` is London itself) and a short intra-Europe hop
from staging (`eu-west-1`, Ireland) — a single Vercel region can't
perfectly co-locate with two different Supabase regions simultaneously, so
this is a deliberate best fit weighted toward production traffic, not a
claim of optimality for both.

**Files updated:**
- `vercel.json` — `regions: ["lhr1"]`.
- Docs: `core.md §2` (deployment topology — region choice and rationale),
  this file, `build-history/index.md`, `core.md` (§6 bump).

**Tests:** none applicable — deployment configuration, not app logic. The
repeat performance analysis below is the verification.

**Verified / Repeat performance analysis:** deployed to staging
(`Staging` branch). Confirmed via a fresh `x-vercel-id` response header
that the function now executes in `lhr1` (was `lhr1::iad1::...`, now
`lhr1::lhr1::...`). Re-measured with the same Lighthouse command (mobile,
simulated throttling) used for step 71, comparing against step 71's
"after" numbers:

| Metric | Feed step 71 → step 72 | Test detail step 71 → step 72 |
|---|---|---|
| Performance score | 0.88 → 0.89 | 0.85 → 0.78-0.83 (3 runs, noisy) |
| LCP | 3.4s → 3.3s | 4.1s → 3.9-4.3s (noisy) |
| LCP breakdown TTFB phase | 807ms → **687ms** (~120ms faster) | 666ms → 678ms (flat) |
| Render Delay | 2634ms → 2584ms (flat) | 3409ms → 3188-3409ms (flat) |
| Speed Index | 4.2s → 4.2s (flat) | 3.9s → 4.2-5.0s (noisy, 3 runs averaged) |

The feed page shows a clean, consistent ~120ms TTFB improvement — matches
removing the transatlantic hop for that page's single (post-step-71)
database round trip. The test-detail page shows no clear signal either
way; three repeated runs land in a similar spread to step 71's single
measurement, consistent with its LCP being dominated by the *external*
Dropbox-hosted video load (see step 69's finding — its LCP element is the
`<video>` itself), not server round-trip time, so a region fix wasn't
expected to move it much. Net: real, modest win on the feed; the
test-detail page's remaining latency is elsewhere (its own media loading,
not something either step 71 or 72 touches).
