import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ABPlayer from '@/components/media/ABPlayer'
import RevealButton from '@/components/tests/RevealButton'
import MappingBadge from '@/components/tests/MappingBadge'
import { toClipData } from '@/lib/clips/to-clip-data'

type Props = {
  params: Promise<{ id: string }>
}

export default async function TestDetailPage({ params }: Props) {
  const { id } = await params
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
    .eq('id', id)
    .single()

  if (error || !test) notFound()

  // --- Security decisions, server-side ---

  const isCreator  = user?.id === test.creator_id
  const isRevealed = test.status === 'revealed'

  // clip_mapping: only fetch if entitled
  let mapping: { before_clip_id: string; after_clip_id: string } | null = null
  if (isCreator || isRevealed) {
    const { data } = await supabase
      .from('clip_mapping')
      .select('before_clip_id, after_clip_id')
      .eq('test_id', test.id)
      .single()
    mapping = data
  }

  // Vote tally visibility
  let hasVoted = false
  if (user) {
    const { count } = await supabase
      .from('votes')
      .select('*', { count: 'exact', head: true })
      .eq('test_id', test.id)
      .eq('user_id', user.id)
    hasVoted = (count ?? 0) > 0
  }

  const canSeeTally = isRevealed || hasVoted

  // --- Shape the clips for ABPlayer ---

  const clips = test.clips as Array<{
    id: string
    label: string
    source_url: string
    provider: string
    media_type: string
    url_status: string
  }>

  const rawA = clips.find(c => c.label === 'A')
  const rawB = clips.find(c => c.label === 'B')

  if (!rawA || !rawB) notFound()

  const clipA = toClipData(rawA)
  const clipB = toClipData(rawB)

  // Cast joined relations — Supabase returns these as arrays even for
  // singular foreign key joins; we take the first element
  const track  = Array.isArray(test.track)  ? test.track[0]  : test.track
  const creator = Array.isArray(test.creator) ? test.creator[0] : test.creator

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {isRevealed ? 'Revealed' : 'Blind test'}
        </p>
        <h1 className="text-2xl font-semibold">{test.title}</h1>
        <p className="text-sm text-gray-500">
          {track?.artist} — {track?.title}
          {track?.album && ` (${track.album})`}
        </p>
        {track?.passage_note && (
          <p className="text-sm text-gray-400 italic">{track.passage_note}</p>
        )}
        <p className="text-xs text-gray-400">
          by {creator?.display_name ?? 'Anonymous'} ·{' '}
          {new Date(test.created_at).toLocaleDateString()}
        </p>
      </div>

      {/* Reveal badge */}
      {isRevealed && mapping && (
        <MappingBadge
          clipAId={clipA.id}
          beforeClipId={mapping.before_clip_id}
          afterClipId={mapping.after_clip_id}
        />
      )}

      {/* Player — login required to see */}
      {user ? (
        <ABPlayer clipA={clipA} clipB={clipB} />
      ) : (
        <div className="rounded border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
          <a href="/login" className="text-blue-600 underline">Sign in</a>
          {' '}to listen to the clips.
        </div>
      )}

      {/* Creator controls */}
      {isCreator && !isRevealed && (
        <RevealButton testId={test.id} />
      )}

      {/* Tally placeholder — replaced in step 9 */}
      {canSeeTally && (
        <div className="rounded border border-gray-200 p-4 text-sm text-gray-400">
          Vote tally will appear here (step 9).
        </div>
      )}

      {/* Vote form placeholder — replaced in step 7 */}
      {user && !isRevealed && (
        <div className="rounded border border-gray-200 p-4 text-sm text-gray-400">
          Voting will appear here (step 7).
        </div>
      )}

    </main>
  )
}