import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

export default async function globalSetup() {
  // Strip any trailing slash — raw string concatenation below (`${baseURL}/...`)
  // would otherwise produce double-slash URLs that Next.js normalizes away,
  // making the final waitForURL target never match the real landing URL.
  const baseURL = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const email = process.env.E2E_TEST_USER_EMAIL

  if (!email) throw new Error('E2E_TEST_USER_EMAIL is not set')
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Generate a one-time magic link for the test user.
  // This bypasses the email inbox entirely. Admin-issued links can't carry a
  // PKCE code_verifier (only a client-initiated signInWithOtp call sets one
  // up), so they always verify via token_hash rather than the `code` flow
  // used by real user sign-ins — Playwright navigates to /auth/confirm
  // (not /auth/callback) with that token_hash to complete the session.
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${baseURL}/auth/confirm`,
    },
  })

  if (error || !data?.properties?.hashed_token) {
    throw new Error(`Could not generate magic link for ${email}: ${error?.message}`)
  }

  // Ensure the auth directory exists
  const authDir = path.join(__dirname, '../playwright/.auth')
  fs.mkdirSync(authDir, { recursive: true })

  const browser = await chromium.launch()
  // Remote targets (staging/preview) sit behind Vercel SSO Deployment
  // Protection — this header lets the automated browser through without
  // disabling protection for everyone else.
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const context = await browser.newContext(
    bypassSecret ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': bypassSecret } } : {},
  )
  const page = await context.newPage()

  // Navigate straight to our own token_hash verification endpoint — this
  // skips Supabase's /auth/v1/verify redirect, which would otherwise send
  // back an implicit-style #access_token fragment that this PKCE-based app
  // has no client-side code to consume.
  const confirmUrl = new URL(`${baseURL}/auth/confirm`)
  confirmUrl.searchParams.set('token_hash', data.properties.hashed_token)
  confirmUrl.searchParams.set('type', 'magiclink')

  await page.goto(confirmUrl.toString())
  await page.waitForURL(`${baseURL}/`, { timeout: 15_000 })

  // Save session cookies so every authenticated test starts pre-signed-in
  await context.storageState({
    path: path.join(authDir, 'user.json'),
  })

  await browser.close()
  console.log(`[E2E setup] Auth session saved for ${email}`)
}
