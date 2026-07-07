/**
 * import-provenance.spec.ts
 *
 * Import provenance UI (build step 32): the "Imported" badge, the "view
 * original post" link, and the claim-contact link shown on placeholder-owned
 * content — and their absence on ordinarily-owned content.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { seedCompleteTest, seedPlaceholderOwnedTest } from '../helpers/admin'
import { ROLE } from '../helpers/constants'
import m from '../../messages/en.json'

test.describe('Import provenance', () => {
  test('test detail page: shows the badge, original-post link, and claim contact', async ({ page }) => {
    const fixture = await seedPlaceholderOwnedTest(`provenance-test-${Date.now()}`)
    await page.goto(routes.test(fixture.test.id))

    await expect(page.getByText(m.common.importedBadge)).toBeVisible()
    await expect(page.getByText(m.common.claimContact)).toBeVisible()

    const originalPostLink = page.getByRole(ROLE.link, { name: m.common.viewOriginalPost })
    await expect(originalPostLink).toBeVisible()
    await expect(originalPostLink).toHaveAttribute('target', '_blank')
  })

  test('feed: shows the badge for a placeholder-owned test', async ({ page }) => {
    const fixture = await seedPlaceholderOwnedTest(`provenance-feed-${Date.now()}`)
    await page.goto(routes.home())

    // fixture.test.title contains "[E2E]" — literal brackets that would be
    // misinterpreted as a regex character class, so scope by plain-text
    // hasText (substring match) rather than a role name regex.
    const card = page.locator('li', { hasText: fixture.test.title })
    await expect(card.getByText(m.common.importedBadge)).toBeVisible()
  })

  test('track detail page: shows the badge on the placeholder-owned test row', async ({ page }) => {
    const fixture = await seedPlaceholderOwnedTest(`provenance-track-${Date.now()}`)
    await page.goto(routes.track(fixture.track.id))

    const row = page.locator('li', { hasText: fixture.test.title })
    await expect(row.getByText(m.common.importedBadge)).toBeVisible()
  })

  test('system detail page: shows the badge and claim contact for a placeholder-owned system', async ({ page }) => {
    const fixture = await seedPlaceholderOwnedTest(`provenance-system-${Date.now()}`)
    await page.goto(routes.system(fixture.systemA.id))

    await expect(page.getByText(m.common.importedBadge)).toBeVisible()
    await expect(page.getByText(m.common.claimContact)).toBeVisible()
  })

  test('an ordinarily-owned test shows none of the provenance UI', async ({ page }) => {
    const fixture = await seedCompleteTest(`provenance-absent-${Date.now()}`)
    await page.goto(routes.test(fixture.test.id))

    await expect(page.getByText(m.common.importedBadge)).not.toBeVisible()
    await expect(page.getByText(m.common.claimContact)).not.toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.common.viewOriginalPost })).not.toBeVisible()
  })
})
