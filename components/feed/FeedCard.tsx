import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export type FeedTest = {
  id: string
  title: string
  status: string
  created_at: string
  track: { artist: string; title: string } | null
  creator: { display_name: string | null } | null
  snapshot_a: { label: string; system: { name: string } | null } | null
  snapshot_b: { label: string; system: { name: string } | null } | null
}

function statusBadge(status: string, t: Awaited<ReturnType<typeof getTranslations<'feed'>>>) {
  return status === 'revealed'
    ? { text: t('statusRevealed'), cls: 'bg-blue-100 text-blue-700' }
    : { text: t('statusBlind'),    cls: 'bg-amber-100 text-amber-700' }
}

export default async function FeedCard({ test }: { test: FeedTest }) {
  const t = await getTranslations('feed')
  const badge = statusBadge(test.status, t)

  const snapshotLine = [
    test.snapshot_a
      ? `${test.snapshot_a.system?.name ?? '?'} · ${test.snapshot_a.label}`
      : null,
    test.snapshot_b
      ? `${test.snapshot_b.system?.name ?? '?'} · ${test.snapshot_b.label}`
      : null,
  ]
    .filter(Boolean)
    .join('  vs  ')

  return (
    <li>
      <Link
        href={`/tests/${test.id}`}
        className="block rounded border border-gray-200 px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium truncate">{test.title}</p>
            {test.track && (
              <p className="text-xs text-gray-500 truncate">
                {test.track.artist} — {test.track.title}
              </p>
            )}
            {snapshotLine && (
              <p className="text-xs text-gray-400 truncate">{snapshotLine}</p>
            )}
            <p className="text-xs text-gray-400">
              {test.creator?.display_name ?? t('anonymous')}
              {' · '}
              {/* suppressHydrationWarning: toLocaleDateString() may differ between Node.js and browser locale */}
              <span suppressHydrationWarning>
                {new Date(test.created_at).toLocaleDateString()}
              </span>
            </p>
          </div>
          <span
            className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full ${badge.cls}`}
          >
            {badge.text}
          </span>
        </div>
      </Link>
    </li>
  )
}
