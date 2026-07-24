import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

// PATCH /api/profile — update the current user's display_name
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: HTTP_UNAUTHORIZED })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: HTTP_BAD_REQUEST })
  }

  const { display_name } = body as Record<string, string | undefined>

  if (!display_name?.trim()) {
    return NextResponse.json({ error: 'display_name is required' }, { status: HTTP_BAD_REQUEST })
  }

  const { data: updated, error } = await supabase
    .from('users')
    .update({ display_name: display_name.trim() })
    .eq('id', user.id)
    .select('display_name')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  return NextResponse.json({ user: updated })
}
