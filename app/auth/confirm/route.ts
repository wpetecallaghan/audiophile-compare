import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// Handles Supabase's token_hash-based email verification links. Unlike the
// `code` flow in /auth/callback (which requires a code_verifier set up by a
// prior client-side signInWithOtp call), token_hash links can be verified
// directly server-side — this is what admin-issued links (Admin API
// generateLink, used by E2E test auth) produce, since there's no client to
// pair a PKCE code_verifier with.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash  = searchParams.get('token_hash')
  const type       = searchParams.get('type') as EmailOtpType | null
  const redirectTo = searchParams.get('redirectTo') ?? '/'

  if (tokenHash && type) {
    const supabase = await createClient()
    await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  }

  // Password reset links include type=recovery — send to profile so the user
  // can set a new password immediately using their active session.
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/profile?reset=true`)
  }

  return NextResponse.redirect(`${origin}${redirectTo}`)
}
