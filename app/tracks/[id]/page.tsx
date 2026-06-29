import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'

type Props = {
  params: Promise<{ id: string }>
}

export default async function TrackDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: track, error } = await supabase
    .from('tracks')
    .select(`
      id, artist, title, album, passage_note,
      tests(
        id, title, status, created_at,
        creator:users!creator_id(display_name)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !track) notFound()

  type TestRow = {
    id: string
    title: string
    status: string
    created_at: string
    creator:
      | { display_name: string | null }
      | { display_name: string | null }[]
  }

  const tests = (track.tests as TestRow[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-gray-400">
        <Link href="/tracks" className="hover:underline">
          Tracks
        </Link>
        {' / '}
        <span>{track.artist} — {track.title}</span>
      </nav>

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Track
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold">
          {track.artist} — {track.title}
        </h1>
        {track.album && (
          <p className="text-sm text-gray-500">{track.album}</p>
        )}
        {track.passage_note && (
          <p className="text-sm text-gray-400 italic">{track.passage_note}</p>
        )}
      </div>

      {/* Tests */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold">Tests</h2>
          <span className="text-sm text-gray-400">
            {tests.length} {tests.length === 1 ? 'test' : 'tests'}
          </span>
        </div>

        {tests.length === 0 ? (
          <p className="text-sm text-gray-400">No tests use this track yet.</p>
        ) : (
          <ul className="space-y-2">
            {tests.map(test => {
              const creator = Array.isArray(test.creator)
                ? test.creator[0]
                : test.creator
              return (
                <li key={test.id}>
                  <Link
                    href={`/tests/${test.id}`}
                    className="flex items-center justify-between rounded border border-gray-200 px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{test.title}</p>
                      <p className="text-xs text-gray-400">
                        by {creator?.display_name ?? 'Anonymous'} ·{' '}
                        {new Date(test.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`ml-4 shrink-0 text-xs px-2 py-0.5 rounded-full ${
                        test.status === 'revealed'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {test.status === 'revealed' ? 'Revealed' : 'Blind'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
