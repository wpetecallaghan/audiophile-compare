import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import NextLink from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/Badge'
import { Heading } from '@/components/ui/Heading'
import { PageShell } from '@/components/ui/PageShell'
import { RowCard } from '@/components/ui/RowCard'
import { Text } from '@/components/ui/Text'
import { getRequestLocale } from '@/lib/dates/get-request-locale'
import { STATUS_DEAD } from '@/lib/clips/check-url'

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
    <PageShell maxWidth="4xl">
      {/* Breadcrumb */}
      <nav className="text-xs text-gray-500 dark:text-gray-400">
        <NextLink href="/tracks" className="hover:underline">
          Tracks
        </NextLink>
        {' / '}
        <span>{track.artist} — {track.title}</span>
      </nav>

      {/* Header — richer than PageHeader's shape (eyebrow + two optional
          subtitle lines, no actions), left as raw JSX rather than forced
          into a single-subtitle slot; see build-history/52-*.md */}
      <div className="space-y-1">
        <Text size="xs" className="font-semibold uppercase tracking-wide">
          {t('trackBadge')}
        </Text>
        <Heading level={1}>
          {track.artist} — {track.title}
        </Heading>
        {track.album && <Text>{track.album}</Text>}
        {track.passage_note && <Text className="italic">{track.passage_note}</Text>}
      </div>

      {/* Tests */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Heading level={2}>{t('testsHeading')}</Heading>
          <Text as="span">
            {tests.length} {tests.length === 1 ? 'test' : 'tests'}
          </Text>
        </div>

        {tests.length === 0 ? (
          <Text>{t('noTestsForTrack')}</Text>
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
              const hasDeadClip = test.clips.some(c => c.url_status === STATUS_DEAD)
              const badge = hasDeadClip
                ? { status: 'broken' as const, text: t('statusBroken') }
                : test.status === 'revealed'
                ? { status: 'revealed' as const, text: t('statusRevealed') }
                : { status: 'blind' as const, text: t('statusBlind') }
              return (
                <RowCard
                  key={test.id}
                  href={`/tests/${test.id}?from=track&fromId=${track.id}`}
                  title={test.title}
                  subtitle={
                    <Text size="xs">
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
                    </Text>
                  }
                  trailing={<Badge status={badge.status}>{badge.text}</Badge>}
                />
              )
            })}
          </ul>
        )}
      </div>
    </PageShell>
  )
}
