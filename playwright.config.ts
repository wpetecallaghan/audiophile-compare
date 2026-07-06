import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import fs from 'fs'

// Playwright's config runs in a plain Node process — unlike `next dev`, it
// doesn't auto-load `.env.local`, so E2E-only vars (E2E_TEST_USER_EMAIL etc.)
// silently disappear unless we load them here.
const envLocalPath = path.join(__dirname, '.env.local')
if (fs.existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath)
}

export const AUTH_FILE = path.join(__dirname, 'playwright/.auth/user.json')

export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  // Sequential — the staging DB cannot safely handle concurrent writes
  fullyParallel: false,
  workers: 1,

  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Remote targets (staging/preview) sit behind Vercel SSO Deployment
    // Protection — this header lets the automated browser through without
    // disabling protection for everyone else.
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : undefined,
  },

  projects: [
    {
      // Default: authenticated via saved storageState
      name: 'authenticated',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      testIgnore: ['**/public-feed.spec.ts'],
    },
    {
      // No cookies — for testing unauthenticated behaviour
      name: 'unauthenticated',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/public-feed.spec.ts'],
    },
  ],

  // Start the dev server automatically when running locally
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
      },
})
