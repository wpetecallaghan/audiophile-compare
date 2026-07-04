import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function TracksPage() {
  const supabase = await createClient()
  const t = await getTranslations('tracks')

  const { data } = await supabase
    .from('tracks')
    .select(`
      id, artist, title, album, passage_note,
      tests(id)
    `)
    .order('artist')
    .order('title')

  const tracks = (data ?? []).map(t => ({
    ...t,
    testCount: (t.tests as { id: string }[]).length,
  }))

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold">{t('heading')}</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
        </span>
      </div>

      {tracks.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('empty')}{' '}
          <Link href="/tests/new" className="text-blue-600 underline">
            {t('createTestLink')}
          </Link>{' '}
          {t('toAddFirst')}
        </p>
      ) : (
        <ul className="space-y-2">
          {tracks.map(track => (
            <li key={track.id}>
              <Link
                href={`/tracks/${track.id}`}
                className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {track.artist} — {track.title}
                  </p>
                  {track.album && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{track.album}</p>
                  )}
                  {track.passage_note && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 italic truncate">
                      {track.passage_note}
                    </p>
                  )}
                </div>
                <span className="ml-4 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {track.testCount} {track.testCount === 1 ? 'test' : 'tests'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
