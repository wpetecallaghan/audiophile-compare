import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

type Props = {
  params: Promise<{ id: string; snapshotId: string }>
}

// PATCH /api/systems/[id]/snapshots/[snapshotId]
//
// Partial update of a snapshot's editable fields: label, notes, components.
// Version is immutable. Requires auth and ownership of the parent system.
export async function PATCH(request: NextRequest, { params }: Props) {
  const { id: systemId, snapshotId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Verify ownership of the parent system
  const { data: system } = await supabase
    .from('systems')
    .select('id, owner_id')
    .eq('id', systemId)
    .single()

  if (!system || system.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Verify the snapshot belongs to this system
  const { data: existing } = await supabase
    .from('system_snapshots')
    .select('id')
    .eq('id', snapshotId)
    .eq('system_id', systemId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { label, notes, components } = body as {
    label?: string
    notes?: string | null
    components?: unknown
  }

  if (label !== undefined && !label.trim()) {
    return NextResponse.json({ error: 'label must not be empty' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (label !== undefined) updates.label = label.trim()
  if (notes !== undefined) {
    updates.notes = typeof notes === 'string' ? (notes.trim() || null) : null
  }
  if (components !== undefined) updates.components = components

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data: snapshot, error } = await supabase
    .from('system_snapshots')
    .update(updates)
    .eq('id', snapshotId)
    .select('id, version, label, notes, components, created_at')
    .single()

  if (error || !snapshot) {
    return NextResponse.json({ error: 'Failed to update snapshot' }, { status: 500 })
  }

  return NextResponse.json({ snapshot }, { status: 200 })
}
