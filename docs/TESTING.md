# Testing Documentation

## Phase 1: Test Infrastructure Setup ✅

The testing infrastructure is now set up and ready to use.

### Installed Dependencies

- **Vitest** - Test runner
- **React Testing Library** - Component testing utilities
- **@testing-library/jest-dom** - Custom DOM matchers
- **@testing-library/user-event** - User interaction simulation
- **MSW (Mock Service Worker)** - API mocking
- **@vitest/coverage-v8** - Coverage reporting

### Available Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Configuration Files

- `vitest.config.ts` - Vitest configuration
- `vitest.setup.ts` - Global test setup (mocks, custom matchers)
- `__tests__/` - Directory for root-level test files
- `lib/clips/__tests__/` - Clip utility tests
- `components/media/__tests__/` - Media component tests

### Test File Naming

Tests can be placed in:
- `__tests__/` directory with `.test.ts` or `.test.tsx` extension
- Anywhere with `.spec.ts` or `.spec.tsx` extension
- Next to the file being tested (e.g., `component.tsx` and `component.test.tsx`)

### Environment Variables

Test environment variables are mocked in `vitest.setup.ts`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Phase 2: Unit Tests ✅

Unit tests have been implemented for core business logic components.

### Implemented Tests

#### ✅ LoginForm Component Tests
**File:** `__tests__/LoginForm.test.tsx` (9 tests)

Tests cover:
- **Rendering** - Email input, submit button, accessibility, initial state
- **State Management** - Success messages, error handling, state resets
- **Supabase Integration** - OTP sign-in with correct parameters and redirects

Key test scenarios:
- Email input rendering and accessibility
- Success message display after submission
- Error message handling
- `redirectTo` parameter handling

#### ✅ Supabase Browser Client Tests
**File:** `__tests__/supabase-client.test.ts` (7 tests)

Tests cover:
- Client creation with environment variables
- Module-level callable (no request context required)
- Returns proper Supabase client instance
- Uses `createBrowserClient` from `@supabase/ssr`

#### ✅ Supabase Server Client Tests
**File:** `__tests__/supabase-server.test.ts` (10 tests)

Tests cover:
- Async client creation with cookies
- Cookie handling (getAll/setAll)
- Error handling in Server Components
- Environment variable configuration
- Request context requirement

#### ✅ Clip Provider Detection Tests
**File:** `lib/clips/__tests__/detect-provider.test.ts` (9 tests)

Tests cover:
- **YouTube** - Standard watch URLs, shortened `youtu.be` URLs, already-embedded URLs
- **Vimeo** - Standard URLs, already-embedded URLs
- **Direct** - Audio and video direct URLs
- **Unknown** - Malformed URLs, empty strings

#### ✅ Clip Data Transformation Tests
**File:** `lib/clips/__tests__/to-clip-data.test.ts` (5 tests)

Tests cover:
- Passthrough of `id`, `label`, `source_url`, `provider`, `media_type`
- `embed_id` and `canonical_url` derivation for YouTube URLs
- `embed_id` and `canonical_url` derivation for Vimeo URLs
- `null` embed_id for direct URLs
- Correct handling of label B clips

#### ✅ ABPlayer Component Tests
**File:** `components/media/__tests__/ABPlayer.test.tsx` (1 test)

Tests cover:
- Renders labels for both clips (A/B)

### Pending Tests (Next.js Environment Required)

The following tests are written but currently skipped pending proper Next.js test environment setup:

#### ⏸️ Middleware Tests
**File:** `__tests__/middleware.test.ts` (20 tests - skipped)

Would test:
- Protected route redirects for unauthenticated users
- Authenticated user access to protected routes
- Public route accessibility
- Session refresh on requests
- Cookie operations
- Nested path protection

**Status:** Requires Next.js middleware runtime environment

#### ⏸️ Auth Callback Route Tests
**File:** `__tests__/auth-callback-route.test.ts` (14 tests - skipped)

Would test:
- Code exchange for session
- Redirect to specified paths
- Missing/invalid code handling
- Security (open redirect prevention)
- Error handling

**Status:** Requires Next.js route handler runtime environment

### Test Coverage Summary

```
Test Suites: 2 skipped, 7 passed, 9 total
Tests:       2 skipped, 47 passed, 49 total
```

**Passing Tests:**
- ✅ Setup verification (3 tests)
- ✅ LoginForm component (9 tests)
- ✅ Supabase browser client (7 tests)
- ✅ Supabase server client (10 tests)
- ✅ Clip provider detection (9 tests)
- ✅ Clip data transformation (5 tests)
- ✅ ABPlayer component (1 test)

**Skipped Tests:**
- ⏸️ Middleware (pending Next.js environment)
- ⏸️ Auth callback route (pending Next.js environment)

## Next Steps

### Phase 3: Integration Tests (Future)

Future integration tests could cover:
- Full authentication flow (E2E)
- Database operations with test data
- Protected route access patterns
- Form submission workflows

### Phase 4: E2E Tests (Future)

Using Playwright for end-to-end testing:
- Magic link authentication flow
- Protected route navigation
- User session persistence
- Error scenarios

### Improving Middleware/Route Tests

To enable the skipped tests, we would need to:
1. Set up proper Next.js edge runtime polyfills
2. Configure test environment for middleware testing
3. Add proper Request/Response mocking
4. Consider using Next.js test helpers or E2E framework instead

## Running the Tests

Verify the setup is working:

```bash
npm test
```

You should see:
```
 Test Files  7 passed | 2 skipped (9)
      Tests  47 passed | 2 skipped (49)
```

Run tests in watch mode during development:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```
