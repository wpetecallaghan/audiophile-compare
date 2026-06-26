import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// GET /api/tracks?q=searchterm
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get('q') ?? ''

  const query = supabase
    .from('tracks')
    .select('id, artist, title, album, passage_note')
    .order('artist')
    .limit(20)

  // Only filter if there's a search term — return all tracks if empty
  if (q.trim()) {
    query.or(`artist.ilike.%${q}%,title.ilike.%${q}%,album.ilike.%${q}%`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tracks: data })
}

// POST /api/tracks — create a new track
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

  const { artist, title, album, passage_note } =
    body as Record<string, string>

  if (!artist?.trim() || !title?.trim()) {
    return NextResponse.json(
      { error: 'artist and title are required' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('tracks')
    .insert({
      created_by: user.id,
      artist: artist.trim(),
      title: title.trim(),
      album: album?.trim() ?? null,
      passage_note: passage_note?.trim() ?? null,
    })
    .select('id, artist, title, album, passage_note')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ track: data }, { status: 201 })
}