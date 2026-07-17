import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/auth/get-request-user'
import { Link } from '@/components/ui/Link'
import FeedCard from '@/components/feed/FeedCard'
import type { FeedTest } from '@/components/feed/FeedCard'
import { getTranslations } from 'next-intl/server'
import { buttonVariants } from '@/components/ui/Button'
import { PageShell } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import { Text } from '@/components/ui/Text'
import { getRequestLocale } from '@/lib/dates/get-request-locale'
import { STATUS_DEAD, type UrlStatus } from '@/lib/clips/check-url'
import { effectiveUrlStatus } from '@/lib/clips/effective-url-status'
import { FEED_PAGE_SIZE } from '@/lib/tests/feed-page-size'
import { ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon } from '@/components/ui/icons'
import { FooterPortal } from '@/components/ui/FooterPortal'
import { FooterNavLink } from '@/components/ui/FooterNavLink'
import { PageLoading } from '@/components/ui/PageLoading'

const PAGE_SIZE = FEED_PAGE_SIZE

type Props = {
  searchParams: Promise<{ page?: string }>
}

export default async function HomePage({ searchParams }: Props) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)

  // Page-to-page pagination only changes a searchParam on this same route
  // (/?page=1 -> /?page=2), which Next.js treats as a lighter-weight update
  // than a dynamic-segment change — it never suspends behind app/loading.tsx
  // the way /tests/[id]'s First/Previous/Next/Last does (confirmed directly:
  // throttling the network shows no skeleton at all on feed pagination
  // without this). Keying this Suspense boundary on `page` forces React to
  // treat every page change as a fresh subtree regardless of how Next.js
  // classifies the navigation, so the same PageLoading fallback
  // app/loading.tsx uses now also covers page-to-page pagination. Don't
  // simplify this back into a plain top-level async function — that
  // silently regresses the skeleton on slow connections (build-history/66).
  return (
    <Suspense key={page} fallback={<PageLoading maxWidth="4xl" />}>
      <FeedContent page={page} />
    </Suspense>
  )
}

async function FeedContent({ page }: { page: number }) {
  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  const supabase = await createClient()
  const locale = await getRequestLocale()

  // middleware.ts already validated the session and forwards the user id
  // via a request header (step 71) — no need to call supabase.auth.getUser()
  // again here, which would be a second Auth-server network round trip on
  // every single page load.
  const user = await getRequestUser()

  const { data, count, error } = await supabase
    .from('tests')
    .select(
      `
        id, title, status, created_at, source_url, source_ref,
        creator_id,
        creator:users!creator_id(display_name),
        track:tracks(artist, title),
        snapshot_a:system_snapshots!snapshot_a_id(label, system:systems(name)),
        snapshot_b:system_snapshots!snapshot_b_id(label, system:systems(name)),
        clips(url_status, admin_override)
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
    source_url: string | null
    source_ref: string | null
    creator_id: string
    creator:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null
    track: { artist: string; title: string } | { artist: string; title: string }[] | null
    snapshot_a: { label: string; system: { name: string } | { name: string }[] | null } | { label: string; system: { name: string } | { name: string }[] | null }[] | null
    snapshot_b: { label: string; system: { name: string } | { name: string }[] | null } | { label: string; system: { name: string } | { name: string }[] | null }[] | null
    clips: { url_status: string; admin_override: UrlStatus | null }[]
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

    // Which systems/components are under comparison must not be disclosed
    // until the test is revealed or the viewer is its creator (step 43) —
    // redacted per row here since a single feed query mixes tests of every
    // status, so this can't be filtered at the query level like the whole
    // rows in app/systems/[id]/page.tsx are.
    const canSeeSystemInfo = t.status === 'revealed' || t.creator_id === user?.id

    // "Was this test ever imported" (step 47) — survives a claim, unlike
    // creator?.is_placeholder, which flips to false the moment a real user
    // claims the content. See app/tests/[id]/page.tsx's identical check
    // for why both columns are OR'd together.
    const isImported = !!(t.source_url || t.source_ref)

    return {
      id:         t.id,
      title:      t.title,
      status:     t.status,
      created_at: t.created_at,
      vote_count: voteCountMap.get(t.id) ?? 0,
      creator:    creator ?? null,
      track:      track   ?? null,
      snapshot_a: canSeeSystemInfo && rawA ? { label: rawA.label, system: sysA ?? null } : null,
      snapshot_b: canSeeSystemInfo && rawB ? { label: rawB.label, system: sysB ?? null } : null,
      is_imported: isImported,
      has_dead_clip: t.clips.some(c => effectiveUrlStatus(c.url_status as UrlStatus, c.admin_override) === STATUS_DEAD),
    }
  })

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages
  const t = await getTranslations('feed')

  return (
    <PageShell maxWidth="4xl">

      <PageHeader
        title={t('heading')}
        subtitle={t('subheading')}
        actions={user && (
          <Link href="/tests/new" className={buttonVariants({ size: 'compact' })}>
            {t('newTestButton')}
          </Link>
        )}
      />

      {/* Feed */}
      {feedTests.length === 0 ? (
        <Text>
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
        </Text>
      ) : (
        <ul className="space-y-2">
          {feedTests.map(test => (
            <FeedCard key={test.id} test={test} locale={locale} page={page} />
          ))}
        </ul>
      )}

      {/* Pagination — portaled into the global footer's nav slot so it's
          always visible without scrolling (see FooterPortal) */}
      {(hasPrev || hasNext) && (
        <FooterPortal>
          <div className="flex items-center gap-2">
            {hasPrev && (
              <FooterNavLink href="/?page=1" aria-label={t('firstPage')}>
                <ChevronsLeftIcon className="w-4 h-4" />
              </FooterNavLink>
            )}
            {hasPrev && (
              <FooterNavLink href={`/?page=${page - 1}`} aria-label={t('previousPage')}>
                <ChevronLeftIcon className="w-4 h-4" />
              </FooterNavLink>
            )}
            <Text as="span" size="xs">
              {t('pageOf', { page, total: totalPages })}
            </Text>
            {hasNext && (
              <FooterNavLink href={`/?page=${page + 1}`} aria-label={t('nextPage')}>
                <ChevronRightIcon className="w-4 h-4" />
              </FooterNavLink>
            )}
            {hasNext && (
              <FooterNavLink href={`/?page=${totalPages}`} aria-label={t('lastPage')}>
                <ChevronsRightIcon className="w-4 h-4" />
              </FooterNavLink>
            )}
          </div>
        </FooterPortal>
      )}

    </PageShell>
  )
}


