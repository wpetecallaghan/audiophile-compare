/**
 * voting.spec.ts
 *
 * Tests the vote → tally → reveal flow against a seeded test.
 * Seeds a complete test fixture before the suite runs.
 * Cleans up via global-teardown.ts.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import {
  seedCompleteTest,
  getTechniqueIdByName,
  setTechniquePreferences,
  resetTechniquePreferences,
  type SeedTestFixture,
} from '../helpers/admin'
import { ROLE } from '../helpers/constants'
import m from '../../messages/en.json'

let fixture: SeedTestFixture

test.beforeAll(async () => {
  fixture = await seedCompleteTest(`vote-${Date.now()}`)
})

test.describe('Voting flow', () => {
  test('before voting, as the creator: tally is hidden but system/snapshot info and vote count are visible (creator entitlement)', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    // The vote count should be visible to all (public stat). Not sourced from
    // messages/en.json — app/tests/[id]/page.tsx hardcodes "vote"/"votes"
    // pluralization rather than using a translation key.
    await expect(page.getByText(/0 vote/i)).toBeVisible()

    // Tally bars (percentages) should NOT be visible before the user votes
    await expect(page.getByText(/%/)).not.toBeVisible()

    // System/snapshot info is gated by canSeeSystemInfo = isRevealed ||
    // isCreator (step 43) — this session IS the test's creator
    // (seedCompleteTest's default creatorId), so it's entitled to see it
    // even though the test is still blind. See the next test for the
    // non-creator case, which must NOT see this.
    await expect(
      page.getByText(`${fixture.systemA.name} · ${fixture.snapshotA.label}`),
    ).toBeVisible()
    await expect(
      page.getByText(`${fixture.systemB.name} · ${fixture.snapshotB.label}`),
    ).toBeVisible()
  })

  test('before voting, as a non-creator: system/snapshot info is hidden on a blind test', async ({ browser }) => {
    // Use an empty context (no cookies) to simulate a non-creator viewer —
    // the harness has only one real authenticated E2E identity (the test's
    // own creator), so a logged-out session is the closest available stand-in
    // for "not the creator." canSeeSystemInfo's isCreator check doesn't
    // distinguish anonymous from a different authenticated user either way.
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    await page.goto(routes.test(fixture.test.id))

    await expect(
      page.getByText(`${fixture.systemA.name} · ${fixture.snapshotA.label}`),
    ).not.toBeVisible()
    await expect(
      page.getByText(`${fixture.systemB.name} · ${fixture.snapshotB.label}`),
    ).not.toBeVisible()

    await context.close()
  })

  test('cast a vote: select clip A for the first technique → Save votes', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    // Select clip A for the first available technique
    const radioA = page.locator(`input[type="radio"][value="${fixture.clipA.id}"]`).first()
    await radioA.check()

    await page.getByRole(ROLE.button, { name: m.tests.vote.saveButton }).click()

    // After saving, tally should be visible — both clips' percentage bars
    // render, so scope to the first match
    await expect(page.getByText(/%/).first()).toBeVisible({ timeout: 5_000 })
  })

  test('update an existing vote: radios pre-filled, change to clip B', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    // The submit button should now say "Update votes"
    await expect(page.getByRole(ROLE.button, { name: m.tests.vote.updateButton })).toBeVisible()

    // Change selection to clip B
    const radioB = page.locator(`input[type="radio"][value="${fixture.clipB.id}"]`).first()
    await radioB.check()

    await page.getByRole(ROLE.button, { name: m.tests.vote.updateButton }).click()

    await expect(page.getByText(/%/).first()).toBeVisible({ timeout: 5_000 })
  })

  test('creator can reveal the test', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    // The Reveal button should be visible to the creator (the E2E test user)
    const revealButton = page.getByRole(ROLE.button, { name: m.tests.reveal.button })
    await expect(revealButton).toBeVisible()

    await revealButton.click()

    // Reveal is a two-step confirmation — clicking the initial button shows
    // a warning panel with a second "Yes, reveal" button
    await page.getByRole(ROLE.button, { name: m.tests.reveal.confirmButton }).click()

    // Wait for the reveal button itself to be gone, not for `mapping.before`
    // ("Before") text to appear — ConfirmButton.tsx's own confirmWarning
    // copy ("...will see the result before they vote") contains the word
    // "before" and stays mounted for the whole confirming/pending duration,
    // so asserting on that text (as this test previously did, paired via
    // `.or()`) can pass as a false positive before the reveal API call has
    // actually completed. The reveal button disappearing only once the page
    // re-renders with isRevealed=true from a real server round-trip is a
    // reliable signal; the next test in this file depends on the reveal
    // having genuinely completed by the time this test finishes.
    await expect(revealButton).not.toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(m.tests.revealedStatus).first()).toBeVisible()
  })

  test('after reveal: system/snapshot info is visible to a non-creator too', async ({ browser }) => {
    // Runs after the previous test has revealed fixture.test — canSeeSystemInfo
    // = isRevealed || isCreator is now true for anyone, not just the creator.
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()

    await page.goto(routes.test(fixture.test.id))

    await expect(
      page.getByText(`${fixture.systemA.name} · ${fixture.snapshotA.label}`),
    ).toBeVisible()
    await expect(
      page.getByText(`${fixture.systemB.name} · ${fixture.snapshotB.label}`),
    ).toBeVisible()

    await context.close()
  })
})

test.describe('Technique preferences applied to voting (build step 45)', () => {
  let techFixture: SeedTestFixture

  test.beforeAll(async () => {
    techFixture = await seedCompleteTest(`vote-techniques-${Date.now()}`)
  })

  // The real E2E test user is one persistent, shared identity across every
  // spec file — see e2e/helpers/admin.ts's own comment on why any test
  // touching technique preferences must reset them afterward.
  test.afterEach(async () => {
    await resetTechniquePreferences()
  })

  test('vote form only offers enabled techniques, and a technique already voted on for this test stays offered even after being disabled elsewhere', async ({ page }) => {
    const tuneMethodId = await getTechniqueIdByName('Tune Method')
    const pratId = await getTechniqueIdByName('PRaT')

    await setTechniquePreferences([tuneMethodId, pratId])
    await page.goto(routes.test(techFixture.test.id))

    // Narrowed correctly — only the two enabled techniques are offered
    await expect(page.getByText('Tune Method')).toBeVisible()
    await expect(page.getByText('PRaT')).toBeVisible()
    await expect(page.getByText('Tonal / Frequency balance')).not.toBeVisible()

    // Vote using PRaT specifically, scoped to its own radio group by the
    // technique-id-keyed input name VoteForm renders
    // (`technique-${t.id}`) — the same clip value appears in every
    // technique's radio group, so this can't be selected by value alone.
    await page.locator(`input[name="technique-${pratId}"][value="${techFixture.clipA.id}"]`).check()
    await page.getByRole(ROLE.button, { name: m.tests.vote.saveButton }).click()
    await expect(page.getByText(/%/).first()).toBeVisible({ timeout: 5_000 })

    // Now disable PRaT — the technique this session just voted with on
    // this specific test — leaving only Tune Method enabled.
    await setTechniquePreferences([tuneMethodId])
    await page.reload()

    // The decision-1 fix: PRaT's block stays offered here specifically,
    // because existingVotes for this test includes it, even though it's
    // no longer in the current preference set. Scoped to the vote form
    // itself, not the whole page — a cast vote means canSeeTally is now
    // true too, and TallyDisplay (a sibling of the form, not inside it)
    // renders its own "PRaT" technique label alongside the tally bar.
    const voteForm = page.locator('form')
    await expect(voteForm.getByText('Tune Method')).toBeVisible()
    await expect(voteForm.getByText('PRaT')).toBeVisible()
    await expect(voteForm.getByText('Tonal / Frequency balance')).not.toBeVisible()
  })
})
