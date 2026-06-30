/**
 * voting.spec.ts
 *
 * Tests the vote → tally → reveal flow against a seeded test.
 * Seeds a complete test fixture before the suite runs.
 * Cleans up via global-teardown.ts.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { seedCompleteTest, type SeedTestFixture } from '../helpers/admin'
import m from '../../messages/en.json'

let fixture: SeedTestFixture

test.beforeAll(async () => {
  fixture = await seedCompleteTest(`vote-${Date.now()}`)
})

test.describe('Voting flow', () => {
  test('before voting: tally is hidden but vote count is visible', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    // The vote count should be visible to all (public stat)
    await expect(page.getByText(/0 vote/i)).toBeVisible()

    // Tally bars (percentages) should NOT be visible before the user votes
    await expect(page.getByText(/%/)).not.toBeVisible()
  })

  test('cast a vote: select clip A for the first technique → Save votes', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    // Select clip A for the first available technique
    const radioA = page.locator(`input[type="radio"][value="${fixture.clipA.id}"]`).first()
    await radioA.check()

    await page.getByRole('button', { name: m.tests.vote.saveButton }).click()

    // After saving, tally should be visible
    await expect(page.getByText(/%/)).toBeVisible({ timeout: 5_000 })
  })

  test('update an existing vote: radios pre-filled, change to clip B', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    // The submit button should now say "Update votes"
    await expect(page.getByRole('button', { name: 'Update votes' })).toBeVisible()

    // Change selection to clip B
    const radioB = page.locator(`input[type="radio"][value="${fixture.clipB.id}"]`).first()
    await radioB.check()

    await page.getByRole('button', { name: 'Update votes' }).click()

    await expect(page.getByText(/%/)).toBeVisible({ timeout: 5_000 })
  })

  test('creator can reveal the test', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    // The Reveal button should be visible to the creator (the E2E test user)
    const revealButton = page.getByRole('button', { name: /Reveal/i })
    await expect(revealButton).toBeVisible()

    await revealButton.click()

    // After reveal, the test is in revealed state — clip mapping is shown
    await expect(page.getByText(/revealed/i).or(page.getByText(/Before/i))).toBeVisible({
      timeout: 5_000,
    })
  })
})
