import type { Page } from '@playwright/test'

// A write (reveal, forum_link edit) is reliably NOT yet visible to an
// independent read for several seconds against real staging. A single
// page.goto() + expect(...).toBeVisible() has no way to ride this out —
// Playwright's built-in retrying only re-inspects the DOM already on the
// page, it never re-fetches from the server. So a test that navigates
// immediately after a write elsewhere (e.g. a fresh, independent browser
// context checking what a just-revealed test looks like) needs to
// actually re-navigate on each attempt, not just re-check.
//
// Only reach for this where the write and the read are genuinely
// independent (different session, or a fresh navigation after another
// test's write) — the writing session's own immediate re-check (e.g. after
// its own router.refresh()) doesn't need this.
//
// Root cause (build step 86, confirmed via temporary per-attempt logging,
// not assumed): NOT Supabase replication lag (no Read Replicas configured
// on this project) and NOT a missing cache invalidation (both the reveal
// route and the forum_link PATCH already call
// `revalidateTag(\`test-${id}\`, { expire: 0 })` correctly on write).
// Measured real attempt latencies of 1.7s–10.4s before `check()` flipped
// true, with zero exceptions along the way (check() just kept returning
// `false`) — too slow for plain single-primary Postgres visibility, but
// exactly the shape of Vercel's Data Cache tag-invalidation propagating
// across edge regions: the writing request's region sees the invalidation
// immediately, but an independent session's request can land on a
// different region whose cached copy hasn't received it yet. Timeout
// history: 8s (original) → 15s (build step 84, informed by nothing more
// than "3 failures happened") → 30s now (build step 86, informed by the
// actual measured 10.4s worst case plus real headroom) — a mitigation for
// this real propagation delay, not a fix for it. A fix would mean bypassing
// the cache entirely for this read in e2e (considered, not done — see that
// build step's notes).
export async function waitForServerState(
  page: Page,
  url: string,
  check: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now()
  let lastError: unknown

  while (Date.now() - start < timeoutMs) {
    await page.goto(url)
    try {
      if (await check()) return
    } catch (e) {
      lastError = e
    }
    await page.waitForTimeout(300)
  }

  throw new Error(
    `waitForServerState: condition not met for ${url} within ${timeoutMs}ms` +
      (lastError ? ` (last error: ${lastError})` : ''),
  )
}
