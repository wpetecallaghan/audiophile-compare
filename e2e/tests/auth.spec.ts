/**
 * auth.spec.ts
 *
 * Tests auth session state: authenticated nav, sign-out, and redirectTo
 * preservation. Runs in the authenticated Playwright project (storageState set).
 */
import { test, expect } from '@playwright/test'
import { AUTH_FILE } from '../../playwright.config'
import { routes } from '../helpers/routes'

test.describe('Authenticated session', () => {
  test('site header shows authenticated navigation links', async ({ page }) => {
    await page.goto(routes.home())
    await expect(page.getByRole('link', { name: 'Systems' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Tracks' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).not.toBeVisible()
  })

  test('sign out clears the session and header reverts to unauthenticated', async ({
    browser,
  }) => {
    // Use a fresh browser context so we don't destroy the shared storageState
    // that other tests in this run depend on
    const context = await browser.newContext({ storageState: AUTH_FILE })
    const page = await context.newPage()

    await page.goto(routes.home())
    await page.getByRole('button', { name: 'Sign out' }).click()

    await expect(page).toHaveURL(routes.home())
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Systems' })).not.toBeVisible()

    await context.close()
  })

  test('redirectTo is preserved when navigating to a protected route unauthenticated', async ({
    browser,
  }) => {
    // Use an empty context (no cookies) to simulate an unauthenticated user
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(routes.systems())

    // Should be on the login page with the redirectTo param intact
    await expect(page).toHaveURL(/\/login/)
    await expect(page).toHaveURL(/redirectTo=%2Fsystems/)

    await context.close()
  })
})
