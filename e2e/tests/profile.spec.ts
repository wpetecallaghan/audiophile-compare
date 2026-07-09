/**
 * profile.spec.ts
 *
 * Tests updating the display name on the profile page.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { ROLE } from '../helpers/constants'
import m from '../../messages/en.json'

test.describe('Profile', () => {
  test('profile page loads and shows the display name field', async ({ page }) => {
    await page.goto(routes.profile())
    await expect(page.getByRole(ROLE.heading, { name: m.profile.heading })).toBeVisible()
    await expect(page.getByLabel(m.profile.displayNameLabel)).toBeVisible()
  })

  test('update display name and see confirmation', async ({ page }) => {
    await page.goto(routes.profile())

    const input = page.getByLabel(m.profile.displayNameLabel)
    await input.clear()
    await input.fill('E2E Test User')

    await page.getByRole(ROLE.button, { name: m.profile.saveButton }).click()

    await expect(page.getByText(m.profile.successMessage)).toBeVisible({ timeout: 5_000 })
  })

  test('Save button is disabled when display name is cleared', async ({ page }) => {
    await page.goto(routes.profile())

    await page.getByLabel(m.profile.displayNameLabel).clear()

    await expect(page.getByRole(ROLE.button, { name: m.profile.saveButton })).toBeDisabled()
  })

  test('non-admin user does not see the Admin section (build step 41)', async ({ page }) => {
    await page.goto(routes.profile())

    await expect(page.getByRole(ROLE.heading, { name: m.profile.heading })).toBeVisible()
    await expect(page.getByRole(ROLE.heading, { name: m.profile.adminHeading })).not.toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.admin.eraseUserData.heading })).not.toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.admin.claim.heading })).not.toBeVisible()
  })
})
