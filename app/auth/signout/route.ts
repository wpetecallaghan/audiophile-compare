import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { HTTP_OK } from '@/lib/api/http-status'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  return NextResponse.json({}, { status: HTTP_OK })
}
