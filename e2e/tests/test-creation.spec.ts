/**
 * test-creation.spec.ts
 *
 * Exercises the full multi-step test creation wizard.
 * Seeds a track and two systems (with snapshots) before the suite runs.
 * The created test is cleaned up by global-teardown.ts.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { E2E_PREFIX } from '../helpers/constants'
import m from '../../messages/en.json'
import {
  seedTrack,
  seedSystem,
  seedSnapshot,
  type SeededTrack,
  type SeededSnapshot,
} from '../helpers/admin'

// Two stable YouTube URLs used for clip verification
const CLIP_URL_A = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const CLIP_URL_B = 'https://www.youtube.com/watch?v=9bZkp7q19f0'

let track: SeededTrack
let snapshotA: SeededSnapshot
let snapshotB: SeededSnapshot

test.beforeAll(async () => {
  const suffix = Date.now().toString()
  track = await seedTrack('Test Artist', `Wizard Track ${suffix}`)
  const sysA = await seedSystem(`Wizard System A ${suffix}`)
  const sysB = await seedSystem(`Wizard System B ${suffix}`)
  snapshotA = await seedSnapshot(sysA.id, `Snap A ${suffix}`)
  snapshotB = await seedSnapshot(sysB.id, `Snap B ${suffix}`)
})

test.describe('Test creation wizard', () => {
  test('step 1: navigate to wizard and search for the seeded track', async ({ page }) => {
    await page.goto(routes.testNew())
    await expect(page.getByRole('heading', { name: /New listening test/i })).toBeVisible()

    // Step indicator should show Track as the active step
    await expect(page.getByText('Track').first()).toBeVisible()

    // Search for the seeded track by its title prefix
    await page.getByPlaceholder(/Search by artist/i).fill(`${E2E_PREFIX} Wizard Track`)
    await expect(page.getByText(track.title)).toBeVisible({ timeout: 5_000 })
  })

  test('full wizard flow: select track → snapshots → verify clips → publish', async ({
    page,
  }) => {
    await page.goto(routes.testNew())

    // ── Step 1: Select track ─────────────────────────────────────────────────
    await page.getByPlaceholder(/Search by artist/i).fill(`${E2E_PREFIX} Wizard Track`)
    await page.getByText(track.title).click()
    await page.getByRole('button', { name: m.tests.wizard.continueButton }).click()

    // ── Step 2: Select snapshots ─────────────────────────────────────────────
    // Snapshot A selector
    const snapASelect = page.getByLabel(/Snapshot A/i)
    await snapASelect.selectOption({ label: snapshotA.label })

    // Snapshot B selector
    const snapBSelect = page.getByLabel(/Snapshot B/i)
    await snapBSelect.selectOption({ label: snapshotB.label })

    await page.getByRole('button', { name: m.tests.wizard.continueButton }).click()

    // ── Step 3: Enter and verify clip URLs ───────────────────────────────────
    // Clip A
    const clipAInput = page.getByPlaceholder(/Clip A/i).or(
      page.locator('input[type="url"]').first(),
    )
    await clipAInput.fill(CLIP_URL_A)
    await page.getByRole('button', { name: 'Verify' }).first().click()
    await expect(page.getByText(/youtube/i).first()).toBeVisible({ timeout: 10_000 })

    // Clip B
    const clipBInput = page.getByPlaceholder(/Clip B/i).or(
      page.locator('input[type="url"]').nth(1),
    )
    await clipBInput.fill(CLIP_URL_B)
    await page.getByRole('button', { name: 'Verify' }).nth(1).click()
    await expect(page.getByText(/youtube/i).nth(1)).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: m.tests.wizard.continueButton }).click()

    // ── Step 4: Publish ──────────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: 'Publish' })).toBeVisible()

    // The title field should be auto-filled; prefix it with [E2E]
    const titleInput = page.getByLabel(/Title/i).or(page.locator('input[type="text"]').first())
    const currentTitle = await titleInput.inputValue()
    await titleInput.clear()
    await titleInput.fill(`${E2E_PREFIX} ${currentTitle}`)

    await page.getByRole('button', { name: m.tests.publishStep.publishButton }).click()

    // Should land on the test detail page
    await expect(page).toHaveURL(/\/tests\/[a-f0-9-]{36}$/, { timeout: 15_000 })
  })
})
