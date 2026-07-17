---
name: audiophile-compare-build-history-73
description: Build step 73 — Lighthouse throttling-method investigation; decision not to pursue RPC consolidation.
---

# ✅ 73 — Throttling-method investigation; RPC consolidation deliberately not pursued

**Why this step exists:** steps 71 and 72 each showed a real, measurable
improvement to TTFB (via `npx lighthouse ... --throttling-method=simulate`),
but the LCP breakdown's dominant "Render Delay" phase (~2.6s on the feed,
~3.2-3.4s on the test-detail page — 75-85% of total LCP) stayed flat
across both. Before committing to step 73 (RPC-consolidating the
test-detail page's batched queries, per the original plan), this was
investigated directly rather than assumed.

**Finding: `--throttling-method=simulate`'s Render Delay number was
misleading for the feed page, but genuinely correct for the test-detail
page — for two different reasons:**

1. **Feed page:** a real `curl` timing against the deployed staging URL
   showed the *entire* response (HTML + all streamed Suspense content)
   arriving in **~200-360ms** end to end — nothing close to a 2.6s delay.
   Cross-checked with `--throttling-method=devtools` (a real simulated
   network/CPU slowdown, rather than `simulate`'s estimated/modeled one):
   LCP **1.9s**, performance score **0.99**. `simulate` mode's estimate
   (LCP 3.3-3.4s, score 0.88-0.89) was simply pessimistic for this page's
   specific resource-loading shape — a lab-methodology artifact, not a
   real bottleneck. The feed page's real-world performance is good.

2. **Test-detail page:** the SAME `devtools` cross-check showed LCP got
   *worse*, not better — **15.0 seconds**, performance score 0.66. The LCP
   element is (again, consistent with step 69's original finding) the
   hidden `<video>` inside the player, pointed at a Dropbox-hosted clip
   file. Under a real throttled connection, that actual media file takes
   a genuinely long time to download — this is real, not a measurement
   artifact, and it has nothing to do with server round-trip time. None of
   steps 71/72/73 touch clip loading at all.

**Decision: step 73 (RPC consolidation) is not being implemented.** Its
entire premise — reducing database round trips — would only ever move the
TTFB slice of LCP (the same ~100-150ms magnitude steps 71 and 72 each
delivered), not the dominant cost on either page: the feed's real
bottleneck turned out not to exist once measured correctly, and the
test-detail page's real bottleneck is clip video loading time, a
completely different problem. Implementing it now would be optimizing a
cost category already shown not to be the constraint — the original step
69 plan's own instinct to defer RPC consolidation as "bigger, riskier"
turned out to also be low-value once measured, not just cautious.

**Not pursued further here, left as a real, separate, future
investigation** (not scoped into this plan): the test-detail page's clip
video loading time — options like lazy-loading the player behind a
poster-frame/click-to-play facade (deferring the large media fetch until
the visitor actually presses play, rather than loading it eagerly behind
`NativePlayer`'s current "load in background, swap visibility" strategy —
see `components.md §5`), transcoding/compressing uploaded clips, or
serving from a faster CDN than Dropbox's own hosting.

**Files updated:**
- Docs only: this file, `build-history/index.md`, `core.md` (§6 bump).
  No app code changed in this step.

**Tests:** none — no code change.

**Verified:** the investigation itself is the verification — see the
"Finding" section above for the exact commands and numbers
(`perf-baselines/devtools-check-*.json`, not committed — see
`.gitignore`).
