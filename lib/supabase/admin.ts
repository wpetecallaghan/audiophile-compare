import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS entirely.
// Only use in server-side contexts (API routes, cron jobs).
// Never import this from a 'use client' file or expose its output in public responses.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
