import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code       = searchParams.get('code')
  const type       = searchParams.get('type')
  const redirectTo = searchParams.get('redirectTo') ?? '/'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Password reset links include type=recovery — send to profile so the user
  // can set a new password immediately using their active session.
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/profile?reset=true`)
  }

  return NextResponse.redirect(`${origin}${redirectTo}`)
}