/**
 * profile.spec.ts
 *
 * Tests updating the display name and listening technique preferences
 * (build step 45) on the profile page.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { ROLE } from '../helpers/constants'
import { getActiveTechniqueIds, setTechniquePreferences, resetTechniquePreferences } from '../helpers/admin'
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

    // exact: true — since build step 45, "Save listening methods" (the
    // technique preferences section's own button) also elsewhere on this
    // page starts with "Save", which a non-exact match would ambiguously
    // catch too.
    await page.getByRole(ROLE.button, { name: m.profile.saveButton, exact: true }).click()

    await expect(page.getByText(m.profile.successMessage)).toBeVisible({ timeout: 5_000 })
  })

  test('Save button is disabled when display name is cleared', async ({ page }) => {
    await page.goto(routes.profile())

    await page.getByLabel(m.profile.displayNameLabel).clear()

    await expect(page.getByRole(ROLE.button, { name: m.profile.saveButton, exact: true })).toBeDisabled()
  })

  test('non-admin user does not see the Admin section (build step 41)', async ({ page }) => {
    await page.goto(routes.profile())

    await expect(page.getByRole(ROLE.heading, { name: m.profile.heading })).toBeVisible()
    await expect(page.getByRole(ROLE.heading, { name: m.profile.adminHeading })).not.toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.admin.eraseUserData.heading })).not.toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.admin.claim.heading })).not.toBeVisible()
  })
})

test.describe('Listening technique preferences (build step 45)', () => {
  // The real E2E test user is one persistent, shared identity across every
  // spec file in the suite (run sequentially in filename order) — any test
  // that changes its technique preferences must restore the default
  // (all active techniques enabled) afterward, or it leaks into whichever
  // spec happens to run next in the same invocation.
  test.afterEach(async () => {
    await resetTechniquePreferences()
  })

  test('shows every active technique checked by default', async ({ page }) => {
    const activeIds = await getActiveTechniqueIds()
    await page.goto(routes.profile())

    await expect(page.getByRole(ROLE.heading, { name: m.profile.techniquesHeading })).toBeVisible()
    const checkboxes = page.getByRole(ROLE.checkbox)
    await expect(checkboxes).toHaveCount(activeIds.length)
    for (const box of await checkboxes.all()) {
      await expect(box).toBeChecked()
    }
  })

  test('saving a narrowed selection persists across a reload', async ({ page }) => {
    await page.goto(routes.profile())

    const tuneMethodCheckbox = page.getByRole(ROLE.checkbox, { name: /tune method/i })
    await tuneMethodCheckbox.uncheck()
    await page.getByRole(ROLE.button, { name: m.profile.techniquesSaveButton }).click()

    await expect(page.getByText(m.profile.techniquesSuccessMessage)).toBeVisible({ timeout: 5_000 })

    await page.reload()
    await expect(page.getByRole(ROLE.checkbox, { name: /tune method/i })).not.toBeChecked()
  })

  test('Save is disabled once every technique is unchecked, so the last one cannot be removed', async ({ page }) => {
    // Start from a single enabled technique — the picker always renders
    // every active technique as a checkbox regardless of preferences, only
    // the checked state varies, so this leaves exactly one box checked.
    const [firstId] = await getActiveTechniqueIds()
    await setTechniquePreferences([firstId])
    await page.goto(routes.profile())

    const checkedBox = page.getByRole(ROLE.checkbox, { checked: true })
    await expect(checkedBox).toHaveCount(1)
    await checkedBox.uncheck()

    await expect(page.getByText(m.profile.techniquesMinError)).toBeVisible()
    await expect(page.getByRole(ROLE.button, { name: m.profile.techniquesSaveButton })).toBeDisabled()
  })
})
