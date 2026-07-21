---
name: audiophile-compare-build-history-85
description: Build step 85 — Widen the waitForServerState timeout and Playwright's CI retry count to reduce (not fix) 3 e2e tests intermittently timing out on real staging replication lag.
---

# ✅ 85 — Mitigate e2e replication-lag flakiness

**The request, reported directly:** a full `npm run test:e2e` run (73/76
passed) showed 3 failures, all in `voting.spec.ts`, all the identical
`waitForServerState: condition not met ... within 8000ms` error. Asked
whether this was timing/flakiness, then asked what could be done about it.

**Diagnosis before acting:** checked whether this was actually an app-level
bug rather than infrastructure flakiness — `app/tests/[id]/page.tsx`'s data
fetch goes through `getCachedTestCore`/`getCachedRevealedMapping`
(`lib/tests/get-cached-test-core.ts`, `unstable_cache`, build step 75), so a
missing cache invalidation on write was a real possibility. Confirmed it
isn't: both `app/api/tests/[id]/reveal/route.ts` and the `forum_link`
`PATCH` in `app/api/tests/[id]/route.ts` already call
`revalidateTag(\`test-${id}\`, { expire: 0 })` correctly. The remaining lag
is below the app's own cache — between the write committing and it being
visible to a **fresh, independent** read against Supabase — exactly what
`e2e/helpers/wait-for-server-state.ts`'s own existing comment already
documents ("confirmed directly... showed the old value for ~2s before
flipping"). All 3 failures were exactly this pattern (an independent
Playwright context reading a test page right after another session's
reveal/forum-link write) exceeding the helper's 8s budget.

**Options considered, not all pursued:**
- Raise the timeout / add a retry — cheap, doesn't fix the cause, chosen
  for now (see Fix below).
- Pin the post-write read to Supabase's primary/writer connection instead
  of whatever a fresh session lands on, if this project has Read Replicas
  enabled — would actually eliminate the lag, but is a Supabase
  project-configuration question outside this codebase; not something to
  verify or change from here.
- Replace the `page.goto()`-per-attempt poll with a lighter-weight direct
  `request.get()` check first (cheaper per attempt, so more attempts fit in
  the same wall-clock budget) — a real option, not implemented this step
  since the direct ask was the timeout/retry bump specifically.

**Fix:**
- `e2e/helpers/wait-for-server-state.ts` — default `timeoutMs` 8,000 → 15,000.
- `playwright.config.ts` — CI `retries` 1 → 2 (local `retries` unchanged at 0).

**Docs:** this file; `build-history/index.md` row.

**Tests:** no unit tests touch e2e config; nothing to update there.

**Verified:**
- Config changes are plain numeric edits — no build/typecheck impact.
- Not re-run against staging in this step (a full suite run mutates real
  staging data — `[E2E] Teardown complete` at the end of the previous run
  confirms this — so it wasn't re-triggered just to watch these 3 specific
  numbers move). The underlying cause is unchanged and still probabilistic;
  this raises the odds of passing, it doesn't guarantee it.
