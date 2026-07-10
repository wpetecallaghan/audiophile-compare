import { headers } from 'next/headers'
import { parseAcceptLanguage } from './parse-accept-language'

// Call this inside any Server Component to get the visiting browser's
// preferred locale (from the Accept-Language request header) for date
// formatting — e.g. `date.toLocaleDateString(await getRequestLocale())`.
// Untestable in isolation (no request context outside Next.js), same as
// lib/supabase/server.ts — exercised via E2E instead.
export async function getRequestLocale(): Promise<string | undefined> {
  const headerList = await headers()
  return parseAcceptLanguage(headerList.get('accept-language'))
}
