/**
 * public-feed.spec.ts
 *
 * Runs WITHOUT authentication (unauthenticated Playwright project).
 * Tests what anonymous users can and cannot do.
 */
import { test, expect } from '@playwright/test'
import { routes } from '../helpers/routes'
import { seedCompleteTest, type SeedTestFixture } from '../helpers/admin'
import { ROLE } from '../helpers/constants'
import m from '../../messages/en.json'

test.describe('Public feed (unauthenticated)', () => {
  test('home page loads successfully', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Audiophile Compare/i)
  })

  test('header shows "Sign in" link and not authenticated nav', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole(ROLE.link, { name: m.nav.signIn })).toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.nav.systems })).not.toBeVisible()
  })

  test('test cards have expected structure when tests exist', async ({ page }) => {
    await page.goto('/')
    const cards = page.locator('article')
    const count = await cards.count()

    if (count === 0) {
      // Feed is empty — just verify the page itself is intact
      await expect(page.getByRole(ROLE.link, { name: m.nav.signIn })).toBeVisible()
      return
    }

    // Each card should have at minimum a heading (the test title)
    const firstCard = cards.first()
    await expect(firstCard.getByRole(ROLE.heading)).toBeVisible()
  })

  test('visiting /systems redirects to /login with redirectTo param', async ({ page }) => {
    await page.goto('/systems')
    await expect(page).toHaveURL(/\/login/)
    await expect(page).toHaveURL(/redirectTo=%2Fsystems/)
  })

  test('login page shows magic link form and Google sign-in button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole(ROLE.heading, { name: m.auth.heading })).toBeVisible()

    // Magic link and Google sign-in each live behind their own tab
    await page.getByRole(ROLE.button, { name: m.auth.tabs.magicLink }).click()
    await expect(page.getByLabel(m.auth.emailLabel)).toBeVisible()
    await expect(page.getByRole(ROLE.button, { name: m.auth.magicLinkButton })).toBeVisible()

    await page.getByRole(ROLE.button, { name: m.auth.tabs.google }).click()
    await expect(page.getByRole(ROLE.button, { name: m.auth.googleButton })).toBeVisible()
  })

  test('register page shows the Google sign-up option alongside the form', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole(ROLE.heading, { name: m.auth.registerHeading })).toBeVisible()

    // No tabs on register — Google and the email form are both visible at once
    await expect(page.getByRole(ROLE.button, { name: m.auth.googleButton })).toBeVisible()
    await expect(page.getByLabel(m.auth.nameLabel)).toBeVisible()
  })

  test('visiting /about shows the about page without requiring login', async ({ page }) => {
    await page.goto('/about')
    await expect(page).toHaveURL('/about')
    await expect(page.getByRole(ROLE.heading, { name: m.about.heading })).toBeVisible()
  })

  test('visiting /privacy shows the privacy policy without requiring login', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page).toHaveURL('/privacy')
    await expect(page.getByRole(ROLE.heading, { name: m.privacy.heading })).toBeVisible()
  })

  test('visiting /terms shows the terms of service without requiring login', async ({ page }) => {
    await page.goto('/terms')
    await expect(page).toHaveURL('/terms')
    await expect(page.getByRole(ROLE.heading, { name: m.terms.heading })).toBeVisible()
  })

  test('footer shows Privacy and Terms links', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole(ROLE.link, { name: m.footer.privacyLink })).toBeVisible()
    await expect(page.getByRole(ROLE.link, { name: m.footer.termsLink })).toBeVisible()
  })

  test('visiting /profile redirects to /login', async ({ page }) => {
    await page.goto('/profile')
    await expect(page).toHaveURL(/\/login/)
  })

  test('visiting /tracks redirects to /login', async ({ page }) => {
    await page.goto('/tracks')
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows a loading skeleton when navigating between feed pages on a slow connection (step 66)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/?page=1')

    const nextPageLink = page.getByRole(ROLE.link, { name: m.feed.nextPage })
    if ((await nextPageLink.count()) === 0) {
      // Not enough tests on this environment for a second feed page — nothing
      // to paginate between, so nothing to verify here (same early-return
      // pattern as the empty-feed case above).
      return
    }

    // Throttle every non-asset request so the loading fallback has time to
    // appear — on a fast connection the Suspense boundary resolves before a
    // human (or this assertion) could ever observe it. Feed pagination only
    // changes a searchParam on this same route (/?page=1 -> /?page=2), which
    // Next.js does NOT suspend behind app/loading.tsx the way a dynamic-
    // segment change (e.g. /tests/[id]'s First/Previous/Next/Last) does —
    // confirmed directly against a real dev server before this step shipped.
    // app/page.tsx's explicit `<Suspense key={page}>` (step 66) is what makes
    // this test pass; removing it regresses this silently on a real slow
    // connection, since a fast local/CI run wouldn't otherwise catch it.
    await page.route('**/*', async route => {
      const url = route.request().url()
      if (!url.match(/\.(js|css|png|jpg|svg|ico|woff2?)(\?|$)/)) {
        await new Promise(r => setTimeout(r, 1500))
      }
      await route.continue()
    })

    // Poll frequently through the whole transition rather than checking
    // once — a single check right after the spinner appears missed a real
    // regression here (step 74 follow-up): an earlier version hid
    // Privacy/Terms via a class on the portaled nav content itself
    // (FooterPortal, mounted by a client-side useEffect), which has an
    // unavoidable brief gap — both on first hydration and, more visibly,
    // between the old page's portal unmounting and the new page's
    // mounting — during which the nav slot reads as empty and
    // Privacy/Terms flash back into view. That gap never showed up in a
    // single fast localhost check but was visible as a real flicker on
    // real mobile devices. The fix (components/ui/FooterPrivacyLinks.tsx)
    // bases the hidden state on the current pathname via `usePathname()`
    // instead, which is available synchronously — including in the
    // server-rendered HTML itself, before any client JS runs at all — so
    // there's no window where it can be wrong.
    await nextPageLink.click()
    await expect(page.getByRole('status')).toBeVisible()
    const privacyLink = page.getByRole(ROLE.link, { name: m.footer.privacyLink })
    for (let i = 0; i < 10; i++) {
      await expect(privacyLink).not.toBeVisible()
      await page.waitForTimeout(100)
    }
    await expect(page.getByRole('status')).not.toBeVisible({ timeout: 5_000 })
    await expect(privacyLink).not.toBeVisible()
    await expect(page).toHaveURL(/\?page=2/)
  })

  test('feed pagination controls have at least a 44x44 touch target (step 68)', async ({ page }) => {
    await page.goto('/?page=1')

    const nextPageLink = page.getByRole(ROLE.link, { name: m.feed.nextPage })
    if ((await nextPageLink.count()) === 0) {
      // Not enough tests on this environment for a second feed page — same
      // early-return pattern as the empty-feed case above.
      return
    }

    // A real geometric check, not just role/label presence — FooterNavLink
    // (components/ui/FooterNavLink.tsx) grows the clickable box around each
    // bare 16px icon to the ~44x44px minimum recommended for a touch target
    // (iOS HIG / WCAG 2.5.5); nothing else in the suite verifies element
    // size, so this is the only thing that would catch a regression back to
    // the old bare-icon-with-no-padding markup.
    const box = await nextPageLink.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  })

  test('footer height stays constant across feed pagination on a narrow viewport (SiteFooter fix)', async ({ page }) => {
    // Regression test: page 1 only shows Next/Last (2 controls); page 2+
    // also shows First/Previous (4 controls) — at a narrow width the extra
    // controls used to push the nav row past what fit alongside the
    // Privacy/Terms links, wrapping the whole footer onto a second line
    // and visibly changing its height between pages. SiteFooter.tsx now
    // always stacks Privacy/Terms and the nav slot on their own rows below
    // the `sm:` breakpoint, so height no longer depends on how many
    // controls happen to render.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/?page=1')

    const nextPageLink = page.getByRole(ROLE.link, { name: m.feed.nextPage })
    if ((await nextPageLink.count()) === 0) {
      // Same early-return pattern as the other pagination tests above.
      return
    }

    const footer = page.locator('footer')
    const page1Height = (await footer.boundingBox())!.height

    await nextPageLink.click()
    await expect(page).toHaveURL(/\?page=2/)
    // FooterPortal mounts its content client-side after hydration — wait
    // for page 2's own First/Previous controls to actually appear (they
    // only exist once hasPrev is true) before measuring, otherwise this
    // can race a brief moment where the nav slot is still empty from the
    // navigation and reads as shorter, not taller.
    await expect(page.getByRole(ROLE.link, { name: m.feed.previousPage })).toBeVisible()
    const page2Height = (await footer.boundingBox())!.height

    expect(page2Height).toBe(page1Height)
  })

  test('Privacy/Terms links are hidden on mobile only when the footer nav is present', async ({ page }) => {
    // Mobile footer space is tight — step-through navigation takes
    // priority over Privacy/Terms there (FooterPrivacyLinks.tsx's
    // pathname-based max-sm:hidden). A page with no nav content (e.g.
    // /about) still shows both links on mobile; a page with nav content
    // hides them there, but both still show together at sm: and up
    // regardless.
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/about')
    await expect(page.getByRole(ROLE.link, { name: m.footer.privacyLink })).toBeVisible()

    await page.goto('/?page=1')
    const nextPageLink = page.getByRole(ROLE.link, { name: m.feed.nextPage })
    if ((await nextPageLink.count()) === 0) {
      // Same early-return pattern as the other pagination tests above.
      return
    }
    await expect(page.getByRole(ROLE.link, { name: m.footer.privacyLink })).not.toBeVisible()

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/?page=1')
    await expect(page.getByRole(ROLE.link, { name: m.footer.privacyLink })).toBeVisible()
  })

  test('Privacy/Terms mobile-hide is decided server-side, not dependent on client JS', async ({ browser }) => {
    // Strongest possible guarantee against the flicker regression above:
    // with JavaScript disabled entirely, the hidden state must already be
    // correct in the raw server-rendered HTML. If a future change moves
    // this decision back to something that needs client JS to resolve
    // (e.g. reading portaled DOM content, as an earlier version of this
    // fix did), this fails immediately and directly, rather than relying
    // on timing/polling luck to catch it.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
    })
    const page = await context.newPage()

    await page.goto('/about')
    await expect(page.getByRole(ROLE.link, { name: m.footer.privacyLink })).toBeVisible()

    await page.goto('/?page=1')
    const nextPageLinkNoJs = page.getByRole(ROLE.link, { name: m.feed.nextPage })
    if ((await nextPageLinkNoJs.count()) > 0) {
      await expect(page.getByRole(ROLE.link, { name: m.footer.privacyLink })).not.toBeVisible()
    }

    await context.close()
  })
})

test.describe('Anonymous clip playback', () => {
  let fixture: SeedTestFixture

  test.beforeAll(async () => {
    fixture = await seedCompleteTest(`anon-play-${Date.now()}`)
  })

  test('anonymous visitor can see the player on a test detail page', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))
    await expect(page.getByRole(ROLE.heading, { name: 'Clip A' })).toBeVisible()
    await expect(page.getByRole(ROLE.heading, { name: 'Clip B' })).toBeVisible()
  })

  // Build step 76: the real YouTube iframe is deferred behind a ClipFacade
  // (thumbnail + play button) until clicked — SDK init is real,
  // uncacheable work paid only when a visitor actually presses play.
  test('clip facade renders instead of an iframe until clicked, then the real player mounts', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))

    const clipASection = page.getByRole(ROLE.heading, { name: 'Clip A', level: 2 }).locator('..')
    await expect(clipASection.locator('iframe')).toHaveCount(0)

    await clipASection
      .getByRole(ROLE.button, { name: m.tests.clipFacade.playAriaLabel.replace('{label}', 'A') })
      .click()

    await expect(clipASection.locator('iframe')).toBeVisible()
  })

  test('anonymous visitor can see the track artist/title on a test detail page (step 70)', async ({ page }) => {
    // Regression coverage for the tracks RLS gap (step 70): the tracks
    // table used to require auth.uid() is not null on select, so this line
    // silently rendered as nothing (track was always null) for anyone not
    // signed in, even though it's never gated on `user` in the page itself.
    await page.goto(routes.test(fixture.test.id))
    await expect(
      page.getByText(`${fixture.track.artist} — ${fixture.track.title}`),
    ).toBeVisible()
  })

  test('anonymous visitor can see the track artist/title on the feed (step 70)', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByText(`${fixture.track.artist} — ${fixture.track.title}`),
    ).toBeVisible()
  })

  test('anonymous visitor sees a "Sign in to vote" prompt instead of the vote form', async ({ page }) => {
    await page.goto(routes.test(fixture.test.id))
    const main = page.getByRole('main')
    await expect(main.getByText(m.tests.signInToVote)).toBeVisible()
    await expect(main.getByRole(ROLE.link, { name: m.tests.signIn })).toBeVisible()
  })

  test('test detail page streams in the footer nav and player under a slow connection (step 69)', async ({ page }) => {
    // Throttle every non-asset request — same pattern as the feed's step-66
    // test. app/tests/[id]/page.tsx splits the footer nav (TestNavFooter)
    // and the clip player (ClipPlayerSection) into their own Suspense
    // boundaries so neither blocks the rest of the page; on a fast
    // connection both resolve too quickly for this assertion to ever
    // observe them settling independently.
    await page.route('**/*', async route => {
      const url = route.request().url()
      if (!url.match(/\.(js|css|png|jpg|svg|ico|woff2?)(\?|$)/)) {
        await new Promise(r => setTimeout(r, 1500))
      }
      await route.continue()
    })

    await page.goto(`${routes.test(fixture.test.id)}?from=feed&page=1`)

    // The player (ClipPlayerSection) still resolves and renders...
    await expect(page.getByRole(ROLE.heading, { name: 'Clip A' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole(ROLE.heading, { name: 'Clip B' })).toBeVisible({ timeout: 10_000 })

    // ...and the footer nav (TestNavFooter, a separate Suspense boundary)
    // streams in too — neither boundary hangs or errors under a slow
    // connection.
    await expect(page.getByRole(ROLE.link, { name: m.tests.nav.all })).toBeVisible({ timeout: 10_000 })
  })
})
