import { createClient } from '@/lib/supabase/server'
import { Link } from '@/components/ui/Link'
import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'
import { PageShell } from '@/components/ui/PageShell'
import { RowCard } from '@/components/ui/RowCard'
import { Text } from '@/components/ui/Text'

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
    <PageShell maxWidth="4xl">
      <div className="flex items-center justify-between">
        <Heading level={1}>{t('heading')}</Heading>
        <Text as="span">
          {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
        </Text>
      </div>

      {tracks.length === 0 ? (
        <Text>
          {t('empty')}{' '}
          <Link href="/tests/new">
            {t('createTestLink')}
          </Link>{' '}
          {t('toAddFirst')}
        </Text>
      ) : (
        <ul className="space-y-2">
          {tracks.map(track => (
            <RowCard
              key={track.id}
              href={`/tracks/${track.id}`}
              title={`${track.artist} — ${track.title}`}
              subtitle={
                <>
                  {track.album && <Text size="xs" className="truncate">{track.album}</Text>}
                  {track.passage_note && (
                    <Text size="xs" className="italic truncate">{track.passage_note}</Text>
                  )}
                </>
              }
              trailing={
                <Text size="xs">{track.testCount} {track.testCount === 1 ? 'test' : 'tests'}</Text>
              }
            />
          ))}
        </ul>
      )}
    </PageShell>
  )
}
