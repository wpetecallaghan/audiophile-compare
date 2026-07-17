import { headers } from 'next/headers'

export type RequestUser = { id: string; email: string | null }

// middleware.ts already calls supabase.auth.getUser() once per request (a
// real network round trip to Supabase Auth, needed to refresh the session
// and gate protected routes) and forwards the validated id/email via these
// headers, unconditionally set/cleared on every request. Reading them here
// avoids paying that same Auth-server round trip a second time in a page.
//
// This only ever feeds UI-level branching (isCreator, canSeeSystemInfo,
// which buttons render) — actual data access still goes through the
// request's real Supabase session cookie, so RLS remains the real
// authorization boundary regardless of this header's value.
export async function getRequestUser(): Promise<RequestUser | null> {
  const headerList = await headers()
  const id = headerList.get('x-user-id')
  if (!id) return null
  return { id, email: headerList.get('x-user-email') }
}
