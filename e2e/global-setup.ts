import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

export default async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
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
  // This bypasses the email inbox entirely — Playwright navigates directly to
  // the link URL, which Supabase verifies and redirects to the app callback.
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: `${baseURL}/auth/callback`,
    },
  })

  if (error || !data?.properties?.action_link) {
    throw new Error(`Could not generate magic link for ${email}: ${error?.message}`)
  }

  // Ensure the auth directory exists
  const authDir = path.join(__dirname, '../playwright/.auth')
  fs.mkdirSync(authDir, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage()

  // Navigate to the magic link — Supabase verifies, redirects to /auth/callback,
  // which exchanges the code and redirects to /
  await page.goto(data.properties.action_link)
  await page.waitForURL(`${baseURL}/`, { timeout: 15_000 })

  // Save session cookies so every authenticated test starts pre-signed-in
  await page.context().storageState({
    path: path.join(authDir, 'user.json'),
  })

  await browser.close()
  console.log(`[E2E setup] Auth session saved for ${email}`)
}
