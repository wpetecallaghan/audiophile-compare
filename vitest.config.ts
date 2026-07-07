import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',  // Default to jsdom for React component tests
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'app/**/*.{js,jsx,ts,tsx}',
        'components/**/*.{js,jsx,ts,tsx}',
        'lib/**/*.{js,jsx,ts,tsx}',
        'middleware.ts',
      ],
      exclude: [
        '**/*.d.ts',
        '**/node_modules/**',
        '**/.next/**',
        '**/coverage/**',
        '**/__tests__/**',
        '**/vitest.config.ts',
      ],
    },
    include: [
      '**/__tests__/**/*.[jt]s?(x)',
      '**/?(*.)+(spec|test).[jt]s?(x)',
    ],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/e2e/**',                    // Playwright specs — run via `npm run test:e2e`, not Vitest
      '**/*.integration.test.ts',     // hits real staging — run via `npm run test:integration`, not `npm test`
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})