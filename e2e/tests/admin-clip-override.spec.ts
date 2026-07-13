/**
 * admin-clip-override.spec.ts
 *
 * Admin-only correction of a clip's health status (step 64) — for when the
 * URL health-check cron gets it wrong. Runs under the `admin` Playwright
 * project (see playwright.config.ts), using the E2E_ADMIN_USER_EMAIL
 * session rather than the regular E2E_TEST_USER_EMAIL one.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { seedCompleteTest } from '../helpers/admin'
import { ROLE } from '../helpers/constants'
import { AUTH_FILE } from '../../playwright.config'
import m from '../../messages/en.json'

test.describe('Admin clip-health override', () => {
  test('forces a healthy clip to broken; warning and vote-block appear even though the cron status is unchanged', async ({ page }) => {
    const fixture = await seedCompleteTest(`admin-override-force-dead-${Date.now()}`)
    await page.goto(routes.test(fixture.test.id))

    await expect(
      page.getByText(m.tests.clipHealth.deadWarning.replace('{label}', 'A')),
    ).not.toBeVisible()

    await page.getByRole(ROLE.button, { name: m.tests.adminOverride.markBroken }).first().click()

    await expect(
      page.getByText(m.tests.clipHealth.deadWarning.replace('{label}', 'A')),
    ).toBeVisible()
    await expect(page.getByText(m.tests.vote.blockedByDeadClip)).toBeVisible()
    await expect(page.getByRole(ROLE.button, { name: m.tests.vote.saveButton })).not.toBeVisible()
  })

  test('clearing an override reverts to the cron\'s own status', async ({ page }) => {
    const fixture = await seedCompleteTest(`admin-override-clear-${Date.now()}`)
    await page.goto(routes.test(fixture.test.id))

    await page.getByRole(ROLE.button, { name: m.tests.adminOverride.markBroken }).first().click()
    await expect(
      page.getByText(m.tests.clipHealth.deadWarning.replace('{label}', 'A')),
    ).toBeVisible()

    await page.getByRole(ROLE.button, { name: m.tests.adminOverride.clear }).first().click()
    await expect(
      page.getByText(m.tests.clipHealth.deadWarning.replace('{label}', 'A')),
    ).not.toBeVisible()
    await expect(page.getByRole(ROLE.button, { name: m.tests.vote.saveButton })).toBeVisible()
  })

  test('forces a cron-reported dead clip to not-broken; warning and vote-block disappear', async ({ page }) => {
    const fixture = await seedCompleteTest(`admin-override-force-ok-${Date.now()}`, { clipBStatus: 'dead' })
    await page.goto(routes.test(fixture.test.id))

    await expect(
      page.getByText(m.tests.clipHealth.deadWarning.replace('{label}', 'B')),
    ).toBeVisible()
    await expect(page.getByRole(ROLE.button, { name: m.tests.vote.saveButton })).not.toBeVisible()

    // Both clips start with no override, so both controls render a "Mark
    // not broken" button (adminOverride !== STATUS_OK is true for either
    // when adminOverride is null) — .last() targets clip B's, since clip
    // A's control always renders first (page.tsx renders A's control
    // before B's).
    await page.getByRole(ROLE.button, { name: m.tests.adminOverride.markOk }).last().click()

    await expect(
      page.getByText(m.tests.clipHealth.deadWarning.replace('{label}', 'B')),
    ).not.toBeVisible()
    await expect(page.getByRole(ROLE.button, { name: m.tests.vote.saveButton })).toBeVisible()
  })

  test.describe('as a non-admin', () => {
    test.use({ storageState: AUTH_FILE })

    test('the override controls are absent, including for the test\'s own creator', async ({ page }) => {
      const fixture = await seedCompleteTest(`admin-override-non-admin-${Date.now()}`)
      await page.goto(routes.test(fixture.test.id))

      await expect(
        page.getByRole(ROLE.button, { name: m.tests.adminOverride.markBroken }),
      ).not.toBeVisible()
      await expect(
        page.getByRole(ROLE.button, { name: m.tests.adminOverride.markOk }),
      ).not.toBeVisible()
    })
  })
})
