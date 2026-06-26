import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// GET /api/systems — returns the user's systems with their snapshots
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('systems')
    .select(`
      id, name, description,
      system_snapshots (
        id, version, label, notes, components, created_at
      )
    `)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    // Order snapshots by version descending — most recent first
    .order('version', { referencedTable: 'system_snapshots', ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ systems: data })
}

// POST /api/systems — create a new system
export async function POST(request: NextRequest) {
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

  const { name, description } = body as Record<string, string>

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('systems')
    .insert({ owner_id: user.id, name: name.trim(), description: description?.trim() ?? null })
    .select('id, name, description')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ system: data }, { status: 201 })
}