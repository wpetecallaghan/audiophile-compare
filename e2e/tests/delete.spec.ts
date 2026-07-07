/**
 * delete.spec.ts
 *
 * Delete flows for tests, snapshots, and systems (step 26). Runs
 * authenticated (default project). Each test seeds its own fixture; a
 * successful delete leaves nothing behind, and anything left after a
 * "blocked" case is [E2E]-prefixed and swept up by global-teardown.ts.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import {
  seedCompleteTest,
  seedSystem,
  seedSnapshot,
  type SeedTestFixture,
} from '../helpers/admin'
import { ROLE } from '../helpers/constants'
import m from '../../messages/en.json'

test.describe('Delete a test', () => {
  test('creator can delete a test with zero votes', async ({ page }) => {
    const fixture = await seedCompleteTest(`delete-test-${Date.now()}`)
    await page.goto(routes.test(fixture.test.id))

    await page.getByRole(ROLE.button, { name: m.tests.delete.button }).click()
    await page.getByRole(ROLE.button, { name: m.tests.delete.confirmButton }).click()

    // Deleting redirects to the home feed — the test no longer exists
    await expect(page).toHaveURL('/')
  })

  test('Delete button is hidden once the test has a vote', async ({ page }) => {
    const fixture = await seedCompleteTest(`delete-test-voted-${Date.now()}`)
    await page.goto(routes.test(fixture.test.id))

    const radioA = page.locator(`input[type="radio"][value="${fixture.clipA.id}"]`).first()
    await radioA.check()
    await page.getByRole(ROLE.button, { name: m.tests.vote.saveButton }).click()
    await expect(page.getByText(/%/).first()).toBeVisible({ timeout: 5_000 })

    await expect(page.getByRole(ROLE.button, { name: m.tests.delete.button })).not.toBeVisible()
  })
})

test.describe('Delete a snapshot', () => {
  test('owner can delete a snapshot with no tests', async ({ page }) => {
    const system = await seedSystem(`delete-snap-${Date.now()}`)
    const snapshot = await seedSnapshot(system.id, `Deletable snapshot ${Date.now()}`)
    await page.goto(routes.system(system.id))

    await expect(page.getByText(snapshot.label)).toBeVisible()
    await page.getByRole(ROLE.button, { name: m.snapshots.delete.button }).click()
    await page.getByRole(ROLE.button, { name: m.snapshots.delete.confirmButton }).click()

    await expect(page.getByText(snapshot.label)).not.toBeVisible()
  })

  test('Delete button is hidden when a test references the snapshot', async ({ page }) => {
    const fixture: SeedTestFixture = await seedCompleteTest(`delete-snap-blocked-${Date.now()}`)
    await page.goto(routes.system(fixture.systemA.id))

    await expect(
      page.getByRole(ROLE.button, { name: m.snapshots.delete.button }),
    ).not.toBeVisible()
  })
})

test.describe('Delete a system', () => {
  test('owner can delete a system with no snapshots', async ({ page }) => {
    const system = await seedSystem(`delete-system-${Date.now()}`)
    await page.goto(routes.system(system.id))

    await page.getByRole(ROLE.button, { name: m.systems.delete.button }).click()
    await page.getByRole(ROLE.button, { name: m.systems.delete.confirmButton }).click()

    // Deleting redirects to the systems list — the system no longer exists
    await expect(page).toHaveURL(routes.systems())
    await expect(page.getByText(system.name)).not.toBeVisible()
  })

  test('Delete button is hidden when the system has a snapshot', async ({ page }) => {
    const system = await seedSystem(`delete-system-blocked-${Date.now()}`)
    const snapshot = await seedSnapshot(system.id, `Blocks system delete ${Date.now()}`)
    await page.goto(routes.system(system.id))

    await expect(
      page.getByRole(ROLE.button, { name: m.systems.delete.button }),
    ).not.toBeVisible()
    await expect(page.getByText(snapshot.label)).toBeVisible()
  })
})
