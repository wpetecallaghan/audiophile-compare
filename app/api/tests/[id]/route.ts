import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: test, error } = await supabase
    .from('tests')
    .select(`
      id, title, status, revealed_at, created_at,
      creator_id,
      creator:users!creator_id(display_name),
      track:tracks(artist, title, album, passage_note),
      clips(id, label, source_url, provider, media_type, url_status)
    `)
    .eq('id', params.id)
    .single()

  if (error || !test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  }

  // Determine if the caller is entitled to see clip_mapping
  const isCreator = user?.id === test.creator_id
  const isRevealed = test.status === 'revealed'
  const canSeeMapping = isCreator || isRevealed

  let mapping = null
  if (canSeeMapping) {
    const { data } = await supabase
      .from('clip_mapping')
      .select('before_clip_id, after_clip_id')
      .eq('test_id', params.id)
      .single()
    mapping = data
  }

  // Determine if the caller can see vote tallies
  let hasVoted = false
  if (user) {
    const { count } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', params.id)
      .eq('user_id', user.id)
    hasVoted = (count ?? 0) > 0
  }

  return NextResponse.json({
    test: {
      ...test,
      // Never leak creator_id to the client — isCreator is enough
      creator_id: undefined,
    },
    isCreator,
    isRevealed,
    canSeeTally: isRevealed || hasVoted,
    mapping,    // null unless entitled
  })
}