/**
 * clip-health.spec.ts
 *
 * Handling of verified-broken clip URLs (step 27): warnings, vote gating,
 * creator remediation, and the "Broken" badge on list surfaces.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { seedCompleteTest } from '../helpers/admin'
import { ROLE } from '../helpers/constants'
import m from '../../messages/en.json'

// A syntactically-valid YouTube URL — POST /api/clips/verify trusts the URL
// pattern for youtube/vimeo (no HEAD request), so this always verifies 'ok'
// without depending on the video actually existing.
const REPLACEMENT_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'

test.describe('Dead clip handling', () => {
  test('shows a warning for the dead clip; player still renders; vote form is replaced', async ({ page }) => {
    const fixture = await seedCompleteTest(`dead-clip-${Date.now()}`, { clipAStatus: 'dead' })
    await page.goto(routes.test(fixture.test.id))

    // Player still renders both clips
    await expect(page.getByRole(ROLE.heading, { name: 'Clip A' })).toBeVisible()
    await expect(page.getByRole(ROLE.heading, { name: 'Clip B' })).toBeVisible()

    // Warning shown for the dead clip
    await expect(page.getByText(m.tests.clipHealth.deadWarning.replace('{label}', 'A'))).toBeVisible()

    // Vote form is replaced with an explanatory message
    await expect(page.getByText(m.tests.vote.blockedByDeadClip)).toBeVisible()
    await expect(page.getByRole(ROLE.button, { name: m.tests.vote.saveButton })).not.toBeVisible()
  })

  test('creator can replace the dead clip\'s URL, clearing the warning', async ({ page }) => {
    const fixture = await seedCompleteTest(`dead-clip-replace-${Date.now()}`, { clipAStatus: 'dead' })
    await page.goto(routes.test(fixture.test.id))

    await page.getByRole(ROLE.button, { name: m.tests.replaceClip.button.replace('{label}', 'A') }).click()
    await page.getByPlaceholder(m.tests.clipsStep.urlPlaceholder).fill(REPLACEMENT_URL)
    await page.getByRole(ROLE.button, { name: m.tests.clipsStep.verifyButton }).click()

    await expect(page.getByText(/^Verified/)).toBeVisible({ timeout: 10_000 })
    await page.getByRole(ROLE.button, { name: m.tests.replaceClip.saveButton }).click()

    await expect(
      page.getByText(m.tests.clipHealth.deadWarning.replace('{label}', 'A')),
    ).not.toBeVisible()
    await expect(page.getByRole(ROLE.button, { name: m.tests.vote.saveButton })).toBeVisible()
  })

  test('shows a "Broken" badge on the track detail page', async ({ page }) => {
    const fixture = await seedCompleteTest(`dead-clip-track-${Date.now()}`, { clipBStatus: 'dead' })
    await page.goto(routes.track(fixture.track.id))

    await expect(page.getByText(m.tracks.statusBroken)).toBeVisible()
  })

  test('shows a "Broken" badge on the system detail page', async ({ page }) => {
    const fixture = await seedCompleteTest(`dead-clip-system-${Date.now()}`, { clipAStatus: 'dead' })
    await page.goto(routes.system(fixture.systemA.id))

    // Not sourced from messages/en.json — app/systems/[id]/page.tsx's
    // outcomeLabel() hardcodes badge text directly, a pre-existing gap
    // (see components.md)
    await expect(page.getByText('Broken')).toBeVisible()
  })
})
