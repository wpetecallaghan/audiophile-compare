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
- `__tests__/` - Root-level test files
- `lib/clips/__tests__/` - Clip utility tests (provider detection, data transformation, shared-clip finding)
- `lib/votes/__tests__/` - Vote tally computation tests
- `components/media/__tests__/` - Media component tests
- `components/tests/__tests__/` - Test UI component tests (VoteForm, StepSnapshots)

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
**File:** `__tests__/LoginForm.test.tsx` (12 tests)

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

#### ✅ VoteForm Component Tests
**File:** `components/tests/__tests__/VoteForm.test.tsx` (20 tests)

Tests cover:
- **Rendering** — technique names/descriptions, A/B radios, disabled submit, headings
- **Conditional rendering** — observation textarea, Other description field visibility
- **Validation** — Other technique requires description; fetch not called on failure
- **Submission** — payload includes only voted techniques, router.refresh() on success, API and network error handling
- **Pre-population** — existing votes pre-select radios and fill observation; "Update votes" label

#### ✅ Vote Tally Computation Tests
**File:** `lib/votes/__tests__/compute-tally.test.ts` (16 tests)

Tests cover:
- Empty input, single technique (100%/0%, 50/50, 67/33, totals)
- Multiple techniques grouped and sorted by sort_order
- Divergence detection (agree, disagree, tied techniques excluded)
- Other votes routed to qualitative list (not curated bars)
- Supabase array join format handled

#### ✅ Snapshot Outcome Computation Tests
**File:** `lib/votes/__tests__/compute-outcome.test.ts` (8 tests)

Tests cover:
- Open (unrevealed) test returns `'open'`
- Revealed test with no votes returns `'no-votes'`
- Revealed test with missing clips returns `'no-votes'`
- Snapshot on side A: win, loss
- Snapshot on side B: win, loss
- Equal votes returns `'draw'`

#### ✅ Shared Clip Finder Tests
**File:** `lib/clips/__tests__/find-shared-clips.test.ts` (9 tests)

Tests cover:
- Empty list A or B returns empty result
- No shared tracks returns empty result
- Snapshot recorded as side A: correct clip (label A) selected
- Snapshot recorded as side B: correct clip (label B) selected
- Mixed sides (A→A, B→B and A→B, B→A): correct clips selected
- Multiple shared tracks all returned
- Duplicate track in one list: first (most recent) entry used

#### ✅ StepSnapshots Component Tests
**File:** `components/tests/__tests__/StepSnapshots.test.tsx` (28 tests)

Tests cover:
- **Rendering** — system name and snapshot labels, "+ Add new snapshot" on every system (including empty), "no systems" message with link, Continue disabled initially
- **Form open/close** — clicking add shows mini-form; Cancel hides it and restores link; fields cleared on reopen
- **Validation** — submit button disabled when label empty; whitespace-only label treated as empty
- **Submission** — `onSnapshotCreated` called with systemId and snapshot; correct POST URL and body; form hidden on success; server error message shown; network error shown
- **Selection** — Continue enabled after selecting both sides; inline creation auto-selects and enables Continue
- **Inline system creation** — trigger button shows/hides form; validation; POST submission; `onSystemCreated` callback invoked with new system; server and network error handling (12 tests)

#### ✅ OAuthButtons Component Tests
**File:** `__tests__/OAuthButtons.test.tsx` (5 tests)

Tests cover:
- **Rendering** — "Continue with Google" button present
- **OAuth call** — `signInWithOAuth` called with `provider: 'google'` on click
- **Redirect URL** — options include `/auth/callback`; `redirectTo` prop appended; falls back to `/` when prop omitted

#### ✅ SignOutButton Component Tests
**File:** `components/__tests__/SignOutButton.test.tsx` (4 tests)

Tests cover:
- **Rendering** — "Sign out" button present
- **Sign-out behaviour** — `supabase.auth.signOut()` called on click; `router.push('/')` called after; shows "Signing out…" and disables the button while in flight

#### ✅ ProfileForm Component Tests
**File:** `components/__tests__/ProfileForm.test.tsx` (13 tests)

Tests cover:
- **Rendering** — pre-populates display name from props; empty input when prop is empty string; Save and Cancel controls; Cancel links to `/`
- **Validation** — Save disabled when name cleared; enabled when non-empty
- **Submission** — PATCHes `/api/profile` with trimmed display_name; shows "Display name updated." on success; clears success message on subsequent edit; server error handling; fallback error; network error; loading state ("Saving…"/disabled)

#### ✅ AddSnapshotForm Component Tests
**File:** `components/systems/__tests__/AddSnapshotForm.test.tsx` (14 tests)

Tests cover:
- **Rendering** — shows trigger button, no form initially
- **Open/close** — form shown on trigger click; Cancel restores trigger button; fields cleared on reopen
- **Validation** — submit disabled when label empty; enabled when non-empty; whitespace-only label treated as empty
- **Submission** — POSTs to correct URL with trimmed label and notes; `router.refresh()` on success; form hidden after success; server error shown; fallback error; network error; notes omitted from body when field empty

#### ✅ CreateSystemForm Component Tests
**File:** `components/systems/__tests__/CreateSystemForm.test.tsx` (11 tests)

Tests cover:
- **Rendering** — name input, description textarea, action buttons present
- **Validation** — submit disabled when name empty; enabled when non-empty; whitespace-only name treated as empty
- **Submission** — POSTs to `/api/systems` with trimmed name and description; redirects to new system detail page on success; server error handling; fallback error; network error; loading state
- **Cancel** — calls `router.back()`

#### ✅ EditSystemForm Component Tests
**File:** `components/systems/__tests__/EditSystemForm.test.tsx` (12 tests)

Tests cover:
- **Rendering** — pre-populates name and description from props; empty description when prop is null; Save changes and Cancel controls present
- **Validation** — Save disabled when name cleared; enabled when non-empty
- **Submission** — PATCHes `/api/systems/[id]` with trimmed name and description; redirects to system detail page on success; server error handling; fallback error; network error; loading state
- **Cancel** — Cancel link points to the system detail page

#### ✅ SnapshotSection Component Tests
**File:** `components/systems/__tests__/SnapshotSection.test.tsx` (20 tests)

Tests cover:
- **Display mode** — version badge, label, notes, children rendered; component list shown when present, hidden when null; win/loss/draw counts; win/loss row hidden when all zero; Edit button visibility gated by `isOwner`
- **Edit mode open/close** — edit form shows pre-filled label and notes; pre-fills component rows; Cancel restores display mode with original label; keeps original label if edit cancelled after typing
- **Component row management** — "+ Add component" appends empty row; "Remove component" deletes row and re-indexes remaining rows
- **Validation** — Save disabled when label cleared; whitespace-only label treated as empty
- **Submission** — PATCHes to correct URL; sends null for notes when field cleared; `router.refresh()` and closes edit mode on success; server error shown and edit mode kept open; network error shown

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

#### ⏸️ Systems PATCH Route Tests
**File:** `__tests__/systems-patch-route.test.ts` (1 placeholder - skipped)

**Status:** Skipped placeholder; follows the same pattern as middleware and auth-callback tests. Full tests deferred pending Next.js route handler environment setup.

### Test Coverage Summary

```
Test Suites: 3 skipped, 19 passed, 22 total
Tests:       3 skipped, 207 passed, 210 total
```

**Passing Tests:**
- ✅ Setup verification (3 tests)
- ✅ LoginForm component (12 tests)
- ✅ OAuthButtons component (5 tests)
- ✅ SignOutButton component (4 tests)
- ✅ ProfileForm component (13 tests)
- ✅ Supabase browser client (7 tests)
- ✅ Supabase server client (10 tests)
- ✅ Clip provider detection (9 tests)
- ✅ Clip data transformation (5 tests)
- ✅ Shared clip finder (9 tests)
- ✅ ABPlayer component (1 test)
- ✅ VoteForm component (20 tests)
- ✅ StepSnapshots component (28 tests)
- ✅ AddSnapshotForm component (14 tests)
- ✅ CreateSystemForm component (11 tests)
- ✅ EditSystemForm component (12 tests)
- ✅ SnapshotSection component (20 tests)
- ✅ Vote tally computation (16 tests)
- ✅ Snapshot outcome computation (8 tests)

**Skipped Tests:**
- ⏸️ Middleware (pending Next.js environment)
- ⏸️ Auth callback route (pending Next.js environment)
- ⏸️ Systems PATCH route (placeholder, pending Next.js environment)

## Phase 4: E2E Tests ✅

Playwright end-to-end tests run against the live staging database and verify
complete user flows from the browser through Next.js and into Supabase.

See [end-to-end-testing.md](end-to-end-testing.md) for full coverage, design
decisions, environment variables, and how to run the tests.

**Specs implemented:**
- `public-feed.spec.ts` — unauthenticated user: feed page, redirects
- `auth.spec.ts` — session state, sign-out, `redirectTo` preservation
- `systems.spec.ts` — create/edit system, add/edit snapshot
- `test-creation.spec.ts` — full wizard: track → snapshots → clips → publish
- `voting.spec.ts` — cast vote, update vote, reveal
- `profile.spec.ts` — update display name

## Next Steps

### Phase 3: Integration Tests (Future)

Future integration tests could cover:
- Database operations with test data
- Protected route access patterns
- Form submission workflows at the API boundary

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
 Test Files  19 passed | 3 skipped (22)
      Tests  207 passed | 3 skipped (210)
```

Run tests in watch mode during development:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```
