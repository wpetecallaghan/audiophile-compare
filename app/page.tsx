import { createClient } from '@/lib/supabase/server'
import { Link } from '@/components/ui/Link'
import FeedCard from '@/components/feed/FeedCard'
import type { FeedTest } from '@/components/feed/FeedCard'
import { getTranslations } from 'next-intl/server'
import { buttonVariants } from '@/components/ui/Button'
import { Heading } from '@/components/ui/Heading'

const PAGE_SIZE = 20

type Props = {
  searchParams: Promise<{ page?: string }>
}

export default async function HomePage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data, count, error } = await supabase
    .from('tests')
    .select(
      `
        id, title, status, created_at,
        creator:users!creator_id(display_name),
        track:tracks(artist, title),
        snapshot_a:system_snapshots!snapshot_a_id(label, system:systems(name)),
        snapshot_b:system_snapshots!snapshot_b_id(label, system:systems(name))
      `,
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to)

  const tests = (data ?? []) as unknown as Array<{
    id: string
    title: string
    status: string
    created_at: string
    creator: { display_name: string | null } | { display_name: string | null }[] | null
    track: { artist: string; title: string } | { artist: string; title: string }[] | null
    snapshot_a: { label: string; system: { name: string } | { name: string }[] | null } | { label: string; system: { name: string } | { name: string }[] | null }[] | null
    snapshot_b: { label: string; system: { name: string } | { name: string }[] | null } | { label: string; system: { name: string } | { name: string }[] | null }[] | null
  }>

  // Normalise Supabase joined relations — singular FK joins may come back as
  // an object or a single-element array depending on the PostgREST version
  const testIds = (data ?? []).map(t => t.id)

  // Fetch vote counts for the current page in one RPC call
  const { data: voteCounts } = error || testIds.length === 0
    ? { data: null }
    : await supabase.rpc('test_vote_counts', { test_ids: testIds })

  const voteCountMap = new Map<string, number>(
    (voteCounts ?? []).map(
      (row: { test_id: string; vote_count: number }) => [row.test_id, row.vote_count]
    )
  )

  const feedTests: FeedTest[] = error ? [] : tests.map(t => {
    const creator = Array.isArray(t.creator) ? t.creator[0] : t.creator
    const track   = Array.isArray(t.track)   ? t.track[0]   : t.track

    const rawA = Array.isArray(t.snapshot_a) ? t.snapshot_a[0] : t.snapshot_a
    const rawB = Array.isArray(t.snapshot_b) ? t.snapshot_b[0] : t.snapshot_b

    const sysA = rawA ? (Array.isArray(rawA.system) ? rawA.system[0] : rawA.system) : null
    const sysB = rawB ? (Array.isArray(rawB.system) ? rawB.system[0] : rawB.system) : null

    return {
      id:         t.id,
      title:      t.title,
      status:     t.status,
      created_at: t.created_at,
      vote_count: voteCountMap.get(t.id) ?? 0,
      creator:    creator ?? null,
      track:      track   ?? null,
      snapshot_a: rawA ? { label: rawA.label, system: sysA ?? null } : null,
      snapshot_b: rawB ? { label: rawB.label, system: sysB ?? null } : null,
    }
  })

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages
  const t = await getTranslations('feed')

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Heading level={1}>{t('heading')}</Heading>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('subheading')}
          </p>
        </div>
        {user && (
          <Link
            href="/tests/new"
            className={buttonVariants({ size: 'compact', className: 'shrink-0' })}
          >
            {t('newTestButton')}
          </Link>
        )}
      </div>

      {/* Feed */}
      {feedTests.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('noTests')}{' '}
          {user ? (
            <Link href="/tests/new">
              {t('createFirst')}
            </Link>
          ) : (
            <>
              <Link href="/login">{t('signIn')}</Link>
              {' '}{t('toCreateFirst')}
            </>
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {feedTests.map(test => (
            <FeedCard key={test.id} test={test} />
          ))}
        </ul>
      )}

      {/* Pagination */}
      {(hasPrev || hasNext) && (
        <div className="flex items-center justify-between pt-2">
          {hasPrev ? (
            <Link
              href={`/?page=${page - 1}`}
            >
              {t('previousPage')}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {t('pageOf', { page, total: totalPages })}
          </span>
          {hasNext ? (
            <Link
              href={`/?page=${page + 1}`}
            >
              {t('nextPage')}
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}

    </main>
  )
}


