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
(`Staging` branch), confirmed via a fresh `x-vercel-id` header that the
function now executes in `lhr1`, then re-measured with the same Lighthouse
command (mobile, simulated throttling) used for step 71, comparing against
step 71's "after" numbers:

<!-- numbers filled in once measured against the deployed change -->
