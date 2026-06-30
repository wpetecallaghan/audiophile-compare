import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type Props = {
  params: Promise<{ id: string }>
}

// PATCH /api/systems/[id] — update name and/or description
export async function PATCH(request: NextRequest, { params }: Props) {
  const { id: systemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Verify ownership — return 404 to avoid leaking system existence
  const { data: existing } = await supabase
    .from('systems')
    .select('id, owner_id')
    .eq('id', systemId)
    .single()

  if (!existing || existing.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, description } = body as Record<string, string | undefined>

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data: system, error } = await supabase
    .from('systems')
    .update({
      name: name.trim(),
      description: description?.trim() || null,
    })
    .eq('id', systemId)
    .select('id, name, description')
    .single()

  if (error || !system) {
    return NextResponse.json({ error: 'Failed to update system' }, { status: 500 })
  }

  return NextResponse.json({ system })
}
