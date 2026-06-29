import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type Props = {
  params: Promise<{ id: string }>
}

// POST /api/systems/[id]/snapshots
//
// Adds a new snapshot to the system. The version number is auto-assigned as
// MAX(existing version) + 1 for this system. Components default to null and
// can be filled in afterwards on the /systems/[id] page.
export async function POST(request: NextRequest, { params }: Props) {
  const { id: systemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Verify ownership — return 404 to avoid leaking system existence
  const { data: system } = await supabase
    .from('systems')
    .select('id, owner_id')
    .eq('id', systemId)
    .single()

  if (!system || system.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { label, notes } = body as { label?: string; notes?: string }

  if (!label?.trim()) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 })
  }

  // Compute next version — read MAX(version) and add 1
  const { data: existing } = await supabase
    .from('system_snapshots')
    .select('version')
    .eq('system_id', systemId)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = ((existing?.[0]?.version) ?? 0) + 1

  const { data: snapshot, error } = await supabase
    .from('system_snapshots')
    .insert({
      system_id:  systemId,
      version:    nextVersion,
      label:      label.trim(),
      notes:      notes?.trim() || null,
      components: null,
    })
    .select('id, version, label, notes, components, created_at')
    .single()

  if (error || !snapshot) {
    return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 })
  }

  return NextResponse.json({ snapshot }, { status: 201 })
}
