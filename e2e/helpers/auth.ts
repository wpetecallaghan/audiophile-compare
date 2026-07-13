import type { Browser, BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Signs in a brand-new, independent session for an E2E user via Supabase's
// Admin API. Admin-issued links can't carry a PKCE code_verifier (only a
// client-initiated signInWithOtp call sets one up), so they verify via
// token_hash against /auth/confirm rather than the `code` flow used by
// real user sign-ins — see app/auth/confirm/route.ts.
//
// The returned context's session is independent of playwright/.auth/user.json
// — use this (instead of that shared storageState) for any test that signs
// out or otherwise invalidates its session, so it doesn't take down every
// other authenticated test in the run.
//
// email defaults to E2E_TEST_USER_EMAIL (every existing call site's
// behavior, unchanged) — global-setup.ts also calls this with
// E2E_ADMIN_USER_EMAIL (step 64) to save a second, admin-privileged
// session alongside the regular one.
export async function createAuthenticatedContext(
  browser: Browser,
  rawBaseURL: string,
  email: string = process.env.E2E_TEST_USER_EMAIL!,
): Promise<BrowserContext> {
  // Strip any trailing slash — string concatenation below (`${baseURL}/...`)
  // would otherwise produce double-slash URLs that Next.js normalizes away,
  // making the waitForURL target never match the real landing URL.
  const baseURL = rawBaseURL.replace(/\/+$/, '')

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${baseURL}/auth/confirm` },
  })

  if (error || !data?.properties?.hashed_token) {
    throw new Error(`createAuthenticatedContext: could not generate magic link: ${error?.message}`)
  }

  // Remote targets (staging/preview) sit behind Vercel SSO Deployment
  // Protection — this header lets the automated browser through without
  // disabling protection for everyone else.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  // storageState: undefined guards against the 'authenticated' project's
  // default storageState (AUTH_FILE) leaking into this brand-new session —
  // project `use` options apply to any newContext() call in a test, not just
  // the auto-injected context/page fixtures.
  const context = await browser.newContext({
    storageState: undefined,
    ...(bypassSecret ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret } } : {}),
  })
  const page = await context.newPage()

  const confirmUrl = new URL(`${baseURL}/auth/confirm`)
  confirmUrl.searchParams.set('token_hash', data.properties.hashed_token)
  confirmUrl.searchParams.set('type', 'magiclink')

  await page.goto(confirmUrl.toString())
  await page.waitForURL(`${baseURL}/`, { timeout: 15_000 })
  await page.close()

  return context
}
