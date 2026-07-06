/**
 * auth.spec.ts
 *
 * Tests auth session state: authenticated nav and redirectTo preservation.
 * Runs in the authenticated Playwright project (storageState set).
 *
 * The sign-out test lives in zz-sign-out.spec.ts, not here — see that file
 * for why it must run after every other authenticated spec.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { ROLE } from '../helpers/constants'
import m from '../../messages/en.json'

test.describe('Authenticated session', () => {
  test('site header shows authenticated navigation links', async ({ page }) => {
    await page.goto(routes.home())
    await expect(page.getByRole(ROLE.link, { name: m.nav.systems })).toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.nav.tracks })).toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.nav.profile })).toBeVisible()
    await expect(page.getByRole(ROLE.button, { name: m.nav.signOut })).toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.nav.signIn })).not.toBeVisible()
  })

  test('redirectTo is preserved when navigating to a protected route unauthenticated', async ({
    browser,
  }) => {
    // Use an empty context (no cookies) to simulate an unauthenticated user.
    // storageState must be explicitly cleared — the 'authenticated' project
    // sets it as a default for every new context, including manually created
    // ones, so an unqualified browser.newContext() here would silently stay
    // signed in.
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    await page.goto(routes.systems())

    // Should be on the login page with the redirectTo param intact
    await expect(page).toHaveURL(/\/login/)
    await expect(page).toHaveURL(/redirectTo=%2Fsystems/)

    await context.close()
  })
})
