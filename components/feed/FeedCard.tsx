import { Link } from '@/components/ui/Link'
import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/Badge'
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

export default async function FeedCard({ test }: { test: FeedTest }) {
  const t = await getTranslations('feed')
  const tCommon = await getTranslations('common')
  const badge = statusBadge(test.status, test.has_dead_clip, t)

  const snapshotLine = formatSnapshotLine(test.snapshot_a, test.snapshot_b)

  return (
    <li>
      <Link
        href={`/tests/${test.id}`}
        variant="card"
        className="block"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium truncate">{test.title}</p>
            {test.track && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {test.track.artist} — {test.track.title}
              </p>
            )}
            {snapshotLine && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{snapshotLine}</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {test.creator?.display_name ?? t('anonymous')}
              {' · '}
              {/* suppressHydrationWarning: toLocaleDateString() may differ between Node.js and browser locale */}
              <span suppressHydrationWarning>
                {new Date(test.created_at).toLocaleDateString()}
              </span>
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
            </p>
          </div>
          <Badge status={badge.status} className="shrink-0 mt-0.5">
            {badge.text}
          </Badge>
        </div>
      </Link>
    </li>
  )
}
