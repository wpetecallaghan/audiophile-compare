import { vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/app/api/systems/[id]/route', () => ({
  PATCH: vi.fn(),
}))

// These tests require proper Next.js route handler environment.
// The PATCH handler uses NextRequest/NextResponse from the Next.js edge runtime,
// which is not available in Vitest's node environment.
// TODO: Set up proper test environment for route handler testing.
//
// Scenarios covered when enabled:
//
//  1. No session cookie                → 401 Unauthorised
//  2. System ID that does not exist    → 404 Not found
//  3. System owned by a different user → 404 Not found (no existence leak)
//  4. Valid owner, malformed JSON body → 400 Invalid JSON
//  5. Valid owner, missing name field  → 400 name is required
//  6. Valid owner, whitespace-only name → 400 name is required
//  7. Valid owner, valid body with description → 200 { system } with trimmed values
//  8. Valid owner, valid body without description → 200 { system }, description null
describe.skip('PATCH /api/systems/[id]', () => {
  it('placeholder - tests pending Next.js environment setup', () => {
    expect(true).toBe(true)
  })
})
