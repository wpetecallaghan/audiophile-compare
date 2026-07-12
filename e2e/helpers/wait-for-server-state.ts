import type { Page } from '@playwright/test'

// A write (reveal, forum_link edit) is reliably NOT yet visible to an
// independent read for roughly a couple of seconds against real staging —
// confirmed directly: writing via the app's own authenticated route, then
// polling the row via a separate admin connection, showed the old value for
// ~2s before flipping. A single page.goto() + expect(...).toBeVisible() has
// no way to ride this out — Playwright's built-in retrying only re-inspects
// the DOM already on the page, it never re-fetches from the server. So a
// test that navigates immediately after a write elsewhere (e.g. a fresh,
// independent browser context checking what a just-revealed test looks
// like) needs to actually re-navigate on each attempt, not just re-check.
//
// Only reach for this where the write and the read are genuinely
// independent (different session, or a fresh navigation after another
// test's write) — the writing session's own immediate re-check (e.g. after
// its own router.refresh()) doesn't need this.
export async function waitForServerState(
  page: Page,
  url: string,
  check: () => Promise<boolean>,
  timeoutMs = 8_000,
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
