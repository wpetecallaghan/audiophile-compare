import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  HTTP_BAD_REQUEST,
  HTTP_CREATED,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_UNAUTHORIZED,
} from '@/lib/api/http-status'

// GET /api/tracks?q=searchterm
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: HTTP_UNAUTHORIZED })
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
    return NextResponse.json({ error: error.message }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  return NextResponse.json({ tracks: data })
}

// POST /api/tracks — create a new track
export async function POST(request: NextRequest) {
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

  const { artist, title, album, passage_note } =
    body as Record<string, string>

  if (!artist?.trim() || !title?.trim()) {
    return NextResponse.json(
      { error: 'artist and title are required' },
      { status: HTTP_BAD_REQUEST }
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
    return NextResponse.json({ error: error.message }, { status: HTTP_INTERNAL_SERVER_ERROR })
  }

  return NextResponse.json({ track: data }, { status: HTTP_CREATED })
}