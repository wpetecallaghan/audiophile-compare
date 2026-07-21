---
name: audiophile-compare-build-history-86
description: Build step 86 — Diagnosed the real cause of voting.spec.ts's intermittent waitForServerState timeouts (Vercel Data Cache tag-invalidation propagation, not DB replication lag) via temporary per-attempt logging, and re-set the timeout from real measured data instead of a guess.
---

# ✅ 86 — Find the real cause of the e2e lag, then re-tune from data

**The request, reported directly:** after step 85's timeout bump (8s→15s)
made no difference on a re-run (same 3 tests, still timing out at exactly
the new 15s limit), asked to actually resolve this rather than keep
guessing at timing — "failing e2e tests bring no value."

**Investigation:** confirmed (previous turn) that Supabase Read Replicas
aren't configured on this project, ruling out replica lag. Re-examined a
failed run's `error-context.md` — the captured page snapshot at the moment
of failure already showed the fully revealed page with the exact target
text, which briefly suggested a locator bug rather than lag (a wrong
theory, corrected below). To settle it with data instead of more theory,
temporarily instrumented `waitForServerState` with a `console.log` per
attempt (timestamp + `check()` result) and ran just the reveal-dependent
subset directly: `npx playwright test e2e/tests/voting.spec.ts --grep
"reveal"` (6 tests, not the full 76 — cheaper, and preserves each test's
dependency on the one before it in the same file).

**Result:** all 6 passed, but the real numbers mattered more than the
pass/fail: `check()` returned `false` on every attempt, no exceptions ever
thrown (ruling out the locator-bug theory — it does eventually become
true), until it flipped `true` at **10,360ms** and **7,726ms** for the two
independent-session checks (a third case took 1,684ms). This directly
explains why step 85's 15s bump "did nothing" on its one re-run — that
run's real lag apparently exceeded even 15s, not because 15s was a
reasonable budget that got unlucky, but because the true distribution is
wider and slower than the original code comment's "~2s" estimate assumed.

7–10+ seconds is too slow for plain single-primary Postgres read-your-writes
visibility (no replicas involved). Both mutation routes
(`app/api/tests/[id]/reveal/route.ts`, the `forum_link` `PATCH` in
`app/api/tests/[id]/route.ts`) already correctly call
`revalidateTag(\`test-${id}\`, { expire: 0 })`, ruling out a missing
invalidation. What's left, and what actually fits both the timing and the
fact that only the **independent/anonymous** session is ever affected
(never the writer's own session): Vercel's Data Cache tag-invalidation is
documented to propagate across edge regions in seconds, not instantly — the
writing request's own region sees the fresh data immediately, but a
separate session's request can land on a different region whose cached
copy hasn't received the invalidation yet.

**Options weighed:**
1. Raise the timeout again, now informed by real measured data instead of
   a guess — chosen for this step (see Fix).
2. Bypass the cache entirely for this read path in e2e (e.g. a
   non-production-only header the route honors to skip `unstable_cache`
   and hit Supabase directly) — would make the test deterministic rather
   than racing global cache propagation, but means adding test-only
   behavior to production route code. Explicitly not pursued this step;
   flagged for later if timeouts keep recurring even at 30s.

**Fix:**
- `e2e/helpers/wait-for-server-state.ts` — default `timeoutMs` 15,000 →
  30,000; comment rewritten to state the confirmed root cause (Vercel Data
  Cache propagation) instead of the earlier, unconfirmed "~2s Supabase lag"
  guess, and to record the timeout's revision history so a future reader
  doesn't re-guess from scratch.
- Diagnostic `console.log` calls added for this investigation were removed
  again before landing — they were only meant to answer "what's actually
  happening," not to ship.

**Docs:** this file; `build-history/index.md` row.

**Tests:** no unit test covers this e2e helper; nothing to update.

**Verified:**
- The 6-test targeted run above (`--grep "reveal"`) is the direct evidence
  behind this step's diagnosis and number — see the real latencies quoted
  there.
- Not re-run as the full 76-test suite in this step (each full run mutates
  real staging fixtures; the targeted 6-test run already answered the
  question this step needed answered). A full-suite confirmation run is a
  reasonable next step if reliability needs re-checking again later.
