/**
 * public-feed.spec.ts
 *
 * Runs WITHOUT authentication (unauthenticated Playwright project).
 * Tests what anonymous users can and cannot do.
 */
import { test, expect } from '@playwright/test'

test.describe('Public feed (unauthenticated)', () => {
  test('home page loads successfully', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Audiophile Compare/i)
  })

  test('header shows "Sign in" link and not authenticated nav', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Systems' })).not.toBeVisible()
  })

  test('test cards have expected structure when tests exist', async ({ page }) => {
    await page.goto('/')
    const cards = page.locator('article')
    const count = await cards.count()

    if (count === 0) {
      // Feed is empty — just verify the page itself is intact
      await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
      return
    }

    // Each card should have at minimum a heading (the test title)
    const firstCard = cards.first()
    await expect(firstCard.getByRole('heading')).toBeVisible()
  })

  test('visiting /systems redirects to /login with redirectTo param', async ({ page }) => {
    await page.goto('/systems')
    await expect(page).toHaveURL(/\/login/)
    await expect(page).toHaveURL(/redirectTo=%2Fsystems/)
  })

  test('login page shows magic link form and Google sign-in button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible()
    await expect(page.getByLabel(/Email address/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Send magic link/i })).toBeVisible()
  })

  test('visiting /profile redirects to /login', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login/)
  })

  test('visiting /tracks redirects to /login', async ({ page }) => {
    await page.goto('/tracks')
    await expect(page).toHaveURL(/\/login/)
  })
})
