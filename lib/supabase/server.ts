import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Call this inside any Server Component or API Route to get a Supabase
// client that has access to the current user's session via cookies.
// It must be called inside a request context — not at module level.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — cookies can't be set
            // here, which is fine. The middleware handles session refresh.
          }
        },
      },
    }
  )
}