import { chromium } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { createAuthenticatedContext } from './helpers/auth'

export default async function globalSetup() {
  // Strip any trailing slash — raw string concatenation in
  // createAuthenticatedContext (`${baseURL}/...`) would otherwise produce
  // double-slash URLs that Next.js normalizes away, making its waitForURL
  // target never match the real landing URL.
  const baseURL = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  const email = process.env.E2E_TEST_USER_EMAIL

  if (!email) throw new Error('E2E_TEST_USER_EMAIL is not set')
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  const authDir = path.join(__dirname, '../playwright/.auth')
  fs.mkdirSync(authDir, { recursive: true })

  const browser = await chromium.launch()
  const context = await createAuthenticatedContext(browser, baseURL)

  // Save session cookies so every authenticated test starts pre-signed-in
  await context.storageState({
    path: path.join(authDir, 'user.json'),
  })

  await browser.close()
  console.log(`[E2E setup] Auth session saved for ${email}`)
}
