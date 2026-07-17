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
import { ROLE } from '../helpers/constants'
import { waitForServerState } from '../helpers/wait-for-server-state'
import m from '../../messages/en.json'

const FORUM_LINK_URL = 'https://forum.example.com/thread/e2e-voting-test'

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

  test('cast a vote: select clip A → Save votes', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    // Only Tune Method is offered — select clip A on it
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
    //
    // exact: true on the revealedStatus check below — TallyDisplay's
    // ownVoteOnlyNote copy ("...until this test is revealed.") contains the
    // same word lowercase, which a non-exact getByText match can hit
    // instead of the real status eyebrow, silently defeating the hardening
    // above. MappingBadge no longer renders its own "Revealed" text (step
    // 67 — it was a redundant duplicate of this same eyebrow), so this is
    // the page's only exact match; no `.first()` needed.
    await expect(revealButton).not.toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(m.tests.revealedStatus, { exact: true })).toBeVisible()
  })

  test('after reveal: system/snapshot info is visible to a non-creator too', async ({ browser }) => {
    // Runs after the previous test has revealed fixture.test — canSeeSystemInfo
    // = isRevealed || isCreator is now true for anyone, not just the creator.
    //
    // Once revealed, the header's own generic snapshotLine is hidden (step
    // 65 — app/tests/[id]/page.tsx gates it on !isRevealed) since
    // MappingBadge becomes the single place this info renders, now correctly
    // tied to each clip's own label (A/B) rather than an unordered "A vs B"
    // pairing. So these assertions now find the text inside MappingBadge,
    // not the header — same literal strings either way (both use
    // formatOneSnapshot's "SystemName · label" format), just relocated.
    //
    // waitForServerState, not a single goto + toBeVisible: the previous
    // test's write (via the creator's own session) is reliably NOT yet
    // visible to this brand-new, independent session for roughly a couple
    // of seconds against real staging (confirmed directly — see that
    // helper's own comment). expect(...).toBeVisible()'s retrying only
    // re-inspects the DOM already on the page; it never re-fetches, so it
    // can't ride out this lag on its own.
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    const url = routes.test(fixture.test.id)

    await waitForServerState(page, url, () =>
      page.getByText(`${fixture.systemA.name} · ${fixture.snapshotA.label}`).isVisible(),
    )
    await expect(
      page.getByText(`${fixture.systemB.name} · ${fixture.snapshotB.label}`),
    ).toBeVisible()

    await context.close()
  })
})

test.describe('Forum discussion link (build step 46)', () => {
  let linkFixture: SeedTestFixture

  test.beforeAll(async () => {
    linkFixture = await seedCompleteTest(`forum-link-${Date.now()}`)
  })

  test('creator can add a forum link on a blind test; a non-creator cannot see it until revealed', async ({ page, browser }) => {
    await page.goto(routes.test(linkFixture.test.id))

    await page.getByRole(ROLE.button, { name: m.tests.forumLink.addButton }).click()
    await page.getByLabel(m.tests.forumLink.label).fill(FORUM_LINK_URL)
    await page.getByRole(ROLE.button, { name: m.tests.forumLink.saveButton }).click()

    const creatorLink = page.getByRole(ROLE.link, { name: m.tests.forumLink.label })
    await expect(creatorLink).toBeVisible({ timeout: 5_000 })
    await expect(creatorLink).toHaveAttribute('href', FORUM_LINK_URL)

    // Non-creator, same blind test: hidden entirely (canSeeSystemInfo gate,
    // the same rule step 43 established) — same logged-out-proxy pattern
    // used throughout this file.
    const context = await browser.newContext({ storageState: undefined })
    const nonCreatorPage = await context.newPage()
    await nonCreatorPage.goto(routes.test(linkFixture.test.id))
    await expect(nonCreatorPage.getByRole(ROLE.link, { name: m.tests.forumLink.label })).not.toBeVisible()
    await context.close()
  })

  test('cast a vote, then reveal the test', async ({ page }) => {
    await page.goto(routes.test(linkFixture.test.id))

    const radioA = page.locator(`input[type="radio"][value="${linkFixture.clipA.id}"]`).first()
    await radioA.check()
    await page.getByRole(ROLE.button, { name: m.tests.vote.saveButton }).click()
    await expect(page.getByText(/%/).first()).toBeVisible({ timeout: 5_000 })

    // Both assertions needed, not just the button disappearing — see the
    // 'creator can reveal the test' test above for why: the confirm panel
    // replaces the original button as soon as it's clicked, regardless of
    // whether the subsequent async reveal call actually succeeds, so that
    // alone isn't a reliable success signal.
    const revealButton = page.getByRole(ROLE.button, { name: m.tests.reveal.button })
    await revealButton.click()
    await page.getByRole(ROLE.button, { name: m.tests.reveal.confirmButton }).click()
    await expect(revealButton).not.toBeVisible({ timeout: 5_000 })
    // exact: true — see 'creator can reveal the test' above.
    await expect(page.getByText(m.tests.revealedStatus, { exact: true })).toBeVisible()
  })

  test('non-creator can see the forum link once revealed', async ({ browser }) => {
    // waitForServerState — see the previous describe block's "after reveal"
    // test for why a single goto + toBeVisible can't ride out the write's
    // visibility lag to this independent session.
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    const url = routes.test(linkFixture.test.id)

    await waitForServerState(page, url, () =>
      page.getByRole(ROLE.link, { name: m.tests.forumLink.label }).isVisible(),
    )
    await context.close()
  })

  test('creator can still edit the forum link after reveal and after a vote exists', async ({ page }) => {
    const updatedUrl = 'https://forum.example.com/thread/e2e-updated'
    const url = routes.test(linkFixture.test.id)

    // Same lag as above — this is a fresh navigation in the creator's own
    // session, not a router.refresh() continuing from the previous test's
    // own write, so it's just as exposed: currentLink (test.forum_link)
    // can still read back null here, showing "+ Add forum link" instead of
    // "Edit forum link" until the previous test's write becomes visible.
    const editButton = page.getByRole(ROLE.button, { name: m.tests.forumLink.editButton })
    await waitForServerState(page, url, () => editButton.isVisible())

    await editButton.click()
    await page.getByLabel(m.tests.forumLink.label).fill(updatedUrl)
    await page.getByRole(ROLE.button, { name: m.tests.forumLink.saveButton }).click()

    const link = page.getByRole(ROLE.link, { name: m.tests.forumLink.label })
    await expect(link).toBeVisible({ timeout: 5_000 })
    await expect(link).toHaveAttribute('href', updatedUrl)
  })
})
