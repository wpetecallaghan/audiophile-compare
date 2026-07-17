import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // x-user-id/x-user-email are stripped from the incoming request headers
  // unconditionally, on every request, before being set below from the
  // freshly-validated user (or left absent) — a client can never make its
  // own copy of these headers survive through to the Server Component.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-user-id')
  requestHeaders.delete('x-user-email')

  // Deferred until the final response is built below (once the x-user-*
  // headers are known) — NOT applied to an intermediate response, since
  // that response would just be discarded, silently dropping a refreshed
  // session cookie.
  let applyCookies: (response: NextResponse) => void = () => {}

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          applyCookies = (response) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          }
        },
      },
    }
  )

  // Refresh the session — this is the main reason this middleware exists.
  // Do not add any logic between createServerClient and getUser();
  // the session token exchange must happen before anything else.
  const { data: { user } } = await supabase.auth.getUser()

  // Forward the already-validated id/email so pages can read them
  // (lib/auth/get-request-user.ts) instead of calling getUser() a second
  // time — a second real network round trip to Supabase Auth otherwise
  // paid on every single page load (step 71).
  if (user) {
    requestHeaders.set('x-user-id', user.id)
    if (user.email) requestHeaders.set('x-user-email', user.email)
  }

  const supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
  applyCookies(supabaseResponse)

  // Redirect unauthenticated users away from protected routes
  const protectedPaths = ['/systems', '/tracks', '/profile', '/tests/new', '/version']
  const isProtectedPath = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Run middleware on all paths except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}