/**
 * systems.spec.ts
 *
 * Full CRUD for systems and snapshots. Creates [E2E]-prefixed data that is
 * cleaned up by global-teardown.ts at the end of the run.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { seedSystem, seedSnapshot } from '../helpers/admin'
import { E2E_PREFIX, ROLE } from '../helpers/constants'
import m from '../../messages/en.json'

const SYSTEM_NAME = `System ${Date.now()}`
const UPDATED_NAME = `${SYSTEM_NAME} (edited)`

test.describe('System management', () => {
  test('create a new system and land on its detail page', async ({ page }) => {
    await page.goto(routes.systemNew())
    await expect(page.getByRole(ROLE.heading, { name: m.systems.newHeading })).toBeVisible()

    await page.getByPlaceholder(m.systems.namePlaceholder).fill(`${E2E_PREFIX} ${SYSTEM_NAME}`)
    await page.getByPlaceholder(m.systems.descriptionPlaceholder).fill('Created by E2E test')
    await page.getByRole(ROLE.button, { name: m.systems.createButton }).click()

    // After creation, should redirect to the system detail page
    await expect(page).toHaveURL(/\/systems\/[a-f0-9-]{36}$/)
    // The name also appears in the breadcrumb, so target the heading specifically
    await expect(page.getByRole(ROLE.heading, { name: `${E2E_PREFIX} ${SYSTEM_NAME}` })).toBeVisible()
  })

  test('edit the system name and description', async ({ page }) => {
    const system = await seedSystem(SYSTEM_NAME)
    await page.goto(routes.systemEdit(system.id))

    await page.getByPlaceholder(m.systems.editNamePlaceholder).clear()
    await page.getByPlaceholder(m.systems.editNamePlaceholder).fill(`${E2E_PREFIX} ${UPDATED_NAME}`)
    await page.getByRole(ROLE.button, { name: m.systems.saveButton }).click()

    // Should redirect to system detail with updated name
    await expect(page).toHaveURL(routes.system(system.id))
    // The name also appears in the breadcrumb, so target the heading specifically
    await expect(page.getByRole(ROLE.heading, { name: `${E2E_PREFIX} ${UPDATED_NAME}` })).toBeVisible()
  })

  test('add a snapshot to a system and see it in the list', async ({ page }) => {
    const system = await seedSystem(`${SYSTEM_NAME} snap`)
    await page.goto(routes.system(system.id))

    // Owner sees the "+ Add new snapshot" trigger
    await page.getByRole(ROLE.button, { name: m.snapshots.addButton }).click()

    const labelInput = page.getByPlaceholder(m.snapshots.labelPlaceholder)
    await expect(labelInput).toBeVisible()
    await labelInput.fill('v1 — E2E snapshot')

    await page.getByRole(ROLE.button, { name: m.snapshots.submitButton }).click()

    // Snapshot should appear in the list
    await expect(page.getByText('v1 — E2E snapshot')).toBeVisible()
  })

  test('edit a snapshot label', async ({ page }) => {
    const system = await seedSystem(`${SYSTEM_NAME} edit-snap`)
    const snapshot = await seedSnapshot(system.id, 'Original label')
    await page.goto(routes.system(system.id))

    await page.getByRole(ROLE.button, { name: m.snapshots.editButton }).first().click()

    // Not sourced from messages/en.json — SnapshotSection's edit-mode label
    // field uses a hardcoded "Label" string, not a translation key
    const labelInput = page.getByLabel(/Label/i)
    await labelInput.clear()
    await labelInput.fill('Updated label')

    await page.getByRole(ROLE.button, { name: m.snapshots.saveButton }).click()

    await expect(page.getByText('Updated label')).toBeVisible()
    // The original label should no longer appear
    await expect(page.getByText('Original label')).not.toBeVisible()
    
    // suppress unused variable warning — snapshot.id used for type context
    void snapshot
  })

  test('systems list shows the test user\'s systems', async ({ page }) => {
    const system = await seedSystem(`${SYSTEM_NAME} list`)
    await page.goto(routes.systems())

    await expect(page.getByRole(ROLE.heading, { name: m.systems.heading })).toBeVisible()
    await expect(page.getByText(`${E2E_PREFIX} ${SYSTEM_NAME} list`)).toBeVisible()

    void system
  })
})
