/**
 * zz-sign-out.spec.ts
 *
 * Sign-out clears the E2E test user's session via Supabase's *global* sign-out
 * scope (components/SignOutButton.tsx calls supabase.auth.signOut() with no
 * scope, which defaults to 'global') — this revokes every session for that
 * account, not just the browser tab that clicked it. That includes the
 * shared session in playwright/.auth/user.json every other authenticated
 * test relies on, regardless of which context triggers the sign-out.
 *
 * The `zz-` prefix is deliberate: with workers: 1 (serial, alphabetical file
 * order), it guarantees this test runs after every other authenticated spec,
 * so the collateral session revocation doesn't take down the rest of the
 * suite. Do not rename this file without preserving that ordering guarantee.
 */
import { test, expect } from '@playwright/test'
import { createAuthenticatedContext } from '../helpers/auth'
import { routes } from '../helpers/routes'
import { ROLE } from '../helpers/constants'
import m from '../../messages/en.json'

test('sign out clears the session and header reverts to unauthenticated', async ({
  browser,
  baseURL,
}) => {
  // A disposable session isolates this test's own local cookies from the
  // shared storageState, but does not protect against the global revocation
  // described above.
  const context = await createAuthenticatedContext(browser, baseURL!)
  const page = await context.newPage()

  await page.goto(routes.home())
  await page.getByRole(ROLE.button, { name: m.nav.signOut }).click()

  await expect(page).toHaveURL(routes.home())
  await expect(page.getByRole(ROLE.link, { name: m.nav.signIn })).toBeVisible()
  await expect(page.getByRole(ROLE.link, { name: m.nav.systems })).not.toBeVisible()

  await context.close()
})
