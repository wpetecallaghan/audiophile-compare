import { createBrowserClient } from '@supabase/ssr'

// Call this inside a Client Component to get a Supabase client.
// Unlike the server client, this can be called at module level —
// it reads env vars that are bundled into the browser build.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}