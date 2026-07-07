import { defineConfig } from 'vitest/config'
import path from 'path'
import fs from 'fs'

// Integration tests hit a real (staging) Supabase project, unlike the main
// vitest.config.ts suite which mocks Supabase entirely — see
// __claude_context__/build-history-ingestion.md step 31 and testing.md §11.
// Deliberately separate from vitest.config.ts so `npm test` never
// accidentally writes to staging: this config is only run via
// `npm run test:integration`.
const envLocalPath = path.join(__dirname, '.env.local')
if (fs.existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath)
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
