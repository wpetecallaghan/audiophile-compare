import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS entirely.
// Only use in server-side contexts (API routes, cron jobs).
// Never import this from a 'use client' file or expose its output in public responses.
//
// Optional explicit url/serviceRoleKey — every deployed call site omits
// them and gets the ambient per-environment values Vercel injects, same
// as always. A local script that needs to target a specific environment
// by choice (e.g. scripts/rollback-lejonklou.ts, which reads
// SUPABASE_URL_STAGING/SUPABASE_URL_PRODUCTION based on --env, since a
// single ambient value can't represent both at once in one .env.local)
// passes them explicitly instead.
export function createAdminClient(url?: string, serviceRoleKey?: string) {
  return createClient(
    url ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
