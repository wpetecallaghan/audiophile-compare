import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// PATCH /api/profile/technique-preferences — replace the current user's
// enabled listening techniques with the given set (step 45). Always the
// user's complete current selection, not an incremental add/remove — no
// rows at all means "all active techniques enabled" (the default), so a
// partial failure between the delete and insert below just falls back to
// that valid default rather than leaving a broken state.
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { technique_ids } = body as Record<string, unknown>

  if (!Array.isArray(technique_ids) || technique_ids.length === 0) {
    return NextResponse.json({ error: 'Select at least one technique' }, { status: 400 })
  }

  const { error: deleteError } = await supabase
    .from('user_technique_preferences')
    .delete()
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to update technique preferences' }, { status: 500 })
  }

  const { error: insertError } = await supabase
    .from('user_technique_preferences')
    .insert(technique_ids.map((technique_id) => ({ user_id: user.id, technique_id })))

  if (insertError) {
    return NextResponse.json({ error: 'Failed to update technique preferences' }, { status: 500 })
  }

  return NextResponse.json({ technique_ids })
}
