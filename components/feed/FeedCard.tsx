import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/Badge'
import { RowCard } from '@/components/ui/RowCard'
import { Text } from '@/components/ui/Text'
import { formatSnapshotLine, type SnapshotSummary } from '@/lib/tests/format-snapshot-line'

export type FeedTest = {
  id: string
  title: string
  status: string
  created_at: string
  vote_count: number
  track: { artist: string; title: string } | null
  creator: { display_name: string | null } | null
  snapshot_a: SnapshotSummary
  snapshot_b: SnapshotSummary
  is_imported: boolean
  has_dead_clip: boolean
}

function statusBadge(
  status: string,
  hasDeadClip: boolean,
  t: Awaited<ReturnType<typeof getTranslations<'feed'>>>,
) {
  if (hasDeadClip) return { text: t('statusBroken'), status: 'broken' as const }
  return status === 'revealed'
    ? { text: t('statusRevealed'), status: 'revealed' as const }
    : { text: t('statusBlind'),    status: 'blind' as const }
}

export default async function FeedCard({
  test,
  locale,
  page,
}: {
  test: FeedTest
  locale?: string
  page: number
}) {
  const t = await getTranslations('feed')
  const tCommon = await getTranslations('common')
  const badge = statusBadge(test.status, test.has_dead_clip, t)

  const snapshotLine = formatSnapshotLine(test.snapshot_a, test.snapshot_b)

  return (
    <RowCard
      href={`/tests/${test.id}?from=feed&page=${page}`}
      title={test.title}
      subtitle={
        <>
          {test.track && (
            <Text size="xs" className="truncate">
              {test.track.artist} — {test.track.title}
            </Text>
          )}
          {snapshotLine && <Text size="xs" className="truncate">{snapshotLine}</Text>}
          <Text size="xs">
            {test.creator?.display_name ?? t('anonymous')}
            {' · '}
            {new Date(test.created_at).toLocaleDateString(locale)}
            {' · '}
            {test.vote_count} {test.vote_count === 1 ? 'vote' : 'votes'}
            {test.is_imported && (
              <>
                {' · '}
                <Badge status="imported" className="align-middle">
                  {tCommon('importedBadge')}
                </Badge>
              </>
            )}
          </Text>
        </>
      }
      trailing={<Badge status={badge.status} className="mt-0.5">{badge.text}</Badge>}
    />
  )
}
