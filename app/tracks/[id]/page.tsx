import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import NextLink from 'next/link'
import { Link } from '@/components/ui/Link'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/Badge'
import { Heading } from '@/components/ui/Heading'
import { getRequestLocale } from '@/lib/dates/get-request-locale'

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
        id, title, status, created_at, source_url, source_ref,
        creator:users!creator_id(display_name),
        clips(url_status)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !track) notFound()

  const t = await getTranslations('tracks')
  const tCommon = await getTranslations('common')
  const locale = await getRequestLocale()

  type TestRow = {
    id: string
    title: string
    status: string
    created_at: string
    source_url: string | null
    source_ref: string | null
    creator:
      | { display_name: string | null }
      | { display_name: string | null }[]
    clips: { url_status: string }[]
  }

  const tests = (track.tests as TestRow[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-gray-500 dark:text-gray-400">
        <NextLink href="/tracks" className="hover:underline">
          Tracks
        </NextLink>
        {' / '}
        <span>{track.artist} — {track.title}</span>
      </nav>

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t('trackBadge')}
        </p>
        <Heading level={1}>
          {track.artist} — {track.title}
        </Heading>
        {track.album && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{track.album}</p>
        )}
        {track.passage_note && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">{track.passage_note}</p>
        )}
      </div>

      {/* Tests */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Heading level={2}>{t('testsHeading')}</Heading>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {tests.length} {tests.length === 1 ? 'test' : 'tests'}
          </span>
        </div>

        {tests.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('noTestsForTrack')}</p>
        ) : (
          <ul className="space-y-2">
            {tests.map(test => {
              const creator = Array.isArray(test.creator)
                ? test.creator[0]
                : test.creator
              // "Was this test ever imported" (step 47) — survives a
              // claim, unlike creator.is_placeholder. See
              // app/tests/[id]/page.tsx's identical check for why both
              // columns are OR'd together.
              const isImported = !!(test.source_url || test.source_ref)
              const hasDeadClip = test.clips.some(c => c.url_status === 'dead')
              const badge = hasDeadClip
                ? { status: 'broken' as const, text: t('statusBroken') }
                : test.status === 'revealed'
                ? { status: 'revealed' as const, text: t('statusRevealed') }
                : { status: 'blind' as const, text: t('statusBlind') }
              return (
                <li key={test.id}>
                  <Link
                    href={`/tests/${test.id}`}
                    variant="card"
                    className="flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{test.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        by {creator?.display_name ?? t('anonymous')} ·{' '}
                        {new Date(test.created_at).toLocaleDateString(locale)}
                        {isImported && (
                          <>
                            {' · '}
                            <Badge status="imported" className="align-middle">
                              {tCommon('importedBadge')}
                            </Badge>
                          </>
                        )}
                      </p>
                    </div>
                    <Badge status={badge.status} className="ml-4 shrink-0">
                      {badge.text}
                    </Badge>
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
