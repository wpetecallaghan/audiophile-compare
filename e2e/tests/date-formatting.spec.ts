/**
 * date-formatting.spec.ts
 *
 * Dates render using the visiting browser's locale (build step 49), read
 * from the Accept-Language request header via lib/dates/get-request-locale.ts.
 * The underlying mechanism is identical at every call site (test detail,
 * track detail, systems pages, feed, snapshots), so this exercises it once,
 * end-to-end, at the test detail page rather than repeating the same
 * assertion everywhere it's wired in.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { seedCompleteTest, setTestCreatedAt } from '../helpers/admin'

// Day 25 disambiguates day/month ordering regardless of what day the suite
// actually runs on.
const FIXED_CREATED_AT = '2024-03-25T12:00:00Z'

test.describe('Date formatting by browser locale', () => {
  test.use({ locale: 'en-GB' })

  test('renders dd/mm/yyyy for a UK-located browser', async ({ page }) => {
    const fixture = await seedCompleteTest(`date-format-gb-${Date.now()}`)
    await setTestCreatedAt(fixture.test.id, FIXED_CREATED_AT)

    await page.goto(routes.test(fixture.test.id))

    await expect(page.getByText('25/03/2024')).toBeVisible()
  })
})

test.describe('Date formatting by browser locale (US)', () => {
  test.use({ locale: 'en-US' })

  test('renders m/d/yyyy for a US-located browser', async ({ page }) => {
    const fixture = await seedCompleteTest(`date-format-us-${Date.now()}`)
    await setTestCreatedAt(fixture.test.id, FIXED_CREATED_AT)

    await page.goto(routes.test(fixture.test.id))

    await expect(page.getByText('3/25/2024')).toBeVisible()
  })
})
