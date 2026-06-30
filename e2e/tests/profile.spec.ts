/**
 * profile.spec.ts
 *
 * Tests updating the display name on the profile page.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'

test.describe('Profile', () => {
  test('profile page loads and shows the display name field', async ({ page }) => {
    await page.goto(routes.profile())
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByLabel('Display name')).toBeVisible()
  })

  test('update display name and see confirmation', async ({ page }) => {
    await page.goto(routes.profile())

    const input = page.getByLabel('Display name')
    await input.clear()
    await input.fill('E2E Test User')

    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Display name updated.')).toBeVisible({ timeout: 5_000 })
  })

  test('Save button is disabled when display name is cleared', async ({ page }) => {
    await page.goto(routes.profile())

    await page.getByLabel('Display name').clear()

    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
