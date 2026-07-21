import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/auth/get-request-user'
import { getCachedTestCore, getCachedRevealedMapping, type RawClip } from '@/lib/tests/get-cached-test-core'
import { notFound } from 'next/navigation'
import { Link } from '@/components/ui/Link'
import { Callout } from '@/components/ui/Callout'
import ABPlayer from '@/components/media/ABPlayer'
import { ClipLabel } from '@/components/media/ClipLabel'
import RevealButton from '@/components/tests/RevealButton'
import DeleteTestButton from '@/components/tests/DeleteTestButton'
import ReplaceClipUrlButton from '@/components/tests/ReplaceClipUrlButton'
import EditForumLinkButton from '@/components/tests/EditForumLinkButton'
import MappingBadge from '@/components/tests/MappingBadge'
import VoteForm from '@/components/tests/VoteForm'
import TallyDisplay from '@/components/tests/TallyDisplay'
import { toClipData } from '@/lib/clips/to-clip-data'
import { isUnsupportedClip } from '@/lib/clips/is-unsupported'
import { computeTally } from '@/lib/votes/compute-tally'
import type { Technique, ExistingVote } from '@/components/tests/VoteForm'
import type { RawVoteRow, TallyResult } from '@/lib/votes/compute-tally'
import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'
import { Badge } from '@/components/ui/Badge'
import { PageShell } from '@/components/ui/PageShell'
import { Text } from '@/components/ui/Text'
import { formatSnapshotLine, type SnapshotSummary } from '@/lib/tests/format-snapshot-line'
import { getRequestLocale } from '@/lib/dates/get-request-locale'
import { STATUS_DEAD, STATUS_DEGRADED, type UrlStatus } from '@/lib/clips/check-url'
import { effectiveUrlStatus } from '@/lib/clips/effective-url-status'
import AdminClipOverrideControl from '@/components/tests/AdminClipOverrideControl'
import { isAdminEmail } from '@/lib/admin/is-admin-email'
import { FEED_PAGE_SIZE } from '@/lib/tests/feed-page-size'
import { ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon, ListIcon, SpinnerIcon } from '@/components/ui/icons'
import { FooterPortal } from '@/components/ui/FooterPortal'
import { FooterNavLink } from '@/components/ui/FooterNavLink'
import { getAdjacentIds } from '@/lib/nav/get-adjacent-ids'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; fromId?: string; page?: string }>
}

export default async function TestDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { from, fromId, page: pageParam } = await searchParams
  const supabase = await createClient()
  const t = await getTranslations('tests')
  const tCommon = await getTranslations('common')
  const tForumLink = await getTranslations('tests.forumLink')
  const locale = await getRequestLocale()

  // middleware.ts already validated the session and forwards the user id
  // via a request header (step 71) — no need to call supabase.auth.getUser()
  // again here, which would be a second Auth-server network round trip on
  // every single page load.
  const user = await getRequestUser()

  // The test row + track + clips + snapshots is identical for every
  // viewer (step 75) — cached and shared across requests. Per-viewer
  // redaction (canSeeSystemInfo etc. below) still runs fresh on every
  // request against the cached data, exactly as before; see
  // lib/tests/get-cached-test-core.ts for the safety reasoning and
  // audiophile-compare-schema.md for the invalidation list.
  const test = await getCachedTestCore(id)

  if (!test) notFound()

  // --- Security decisions, server-side ---

  const isCreator  = user?.id === test.creator_id
  const isRevealed = test.status === 'revealed'
  const canSeeSystemInfo = isRevealed || isCreator
  const isAdmin = isAdminEmail(user?.email)

  // "Was this test ever imported" — step 47. Independent of the current
  // creator's is_placeholder status (which flips to false once claimed):
  // both source_url and source_ref are set only by the ingestion pipeline,
  // never the web wizard, and neither is ever reassigned/cleared by
  // claim_placeholder — so this survives a claim by construction. OR'd
  // rather than either alone: source_url is documented as null for any
  // import predating that column, and the E2E fixture for an unclaimed
  // placeholder-owned test never sets source_ref.
  const isImported = !!(test.source_url || test.source_ref)

  // --- Shape the clips for ABPlayer (pure derivation, no I/O) ---

  const clips = test.clips

  const rawA = clips.find(c => c.label === 'A')
  const rawB = clips.find(c => c.label === 'B')

  if (!rawA || !rawB) notFound()

  // Everything below is independent of everything else in the batch — none
  // of these read another's result — so firing them together turns what
  // used to be 5-6 sequential round trips into roughly one. Tally only
  // joins this batch when the test is already revealed (canSeeTally is then
  // unconditionally true); the still-open case depends on hasVoted, which
  // isn't known until existingVotes below resolves, so it's fetched
  // separately afterward (see canSeeTally below). Clip resolution
  // (toClipData) is deliberately NOT in this batch — see ClipPlayerSection
  // below for why.
  const [
    { data: mapping },
    { data: userVotes },
    { data: voteCountData },
    { data: allActiveTechniques },
    { data: revealedTallyRows },
  ] = await Promise.all([
    // Once revealed, mapping is safe for everyone and served from the same
    // cache as the core test data (step 75) — clip_mapping's own RLS
    // ("revealed OR creator_id = auth.uid()") means the cached function's
    // session-less anon client can only ever read it once revealed, so
    // this doesn't need its own isRevealed re-check. The still-open,
    // creator-only case stays on the dynamic, cookie-based path below —
    // genuinely personalized, not cacheable.
    isRevealed
      ? getCachedRevealedMapping(test.id).then(data => ({ data }))
      : isCreator
        ? supabase.from('clip_mapping').select('before_clip_id, after_clip_id').eq('test_id', test.id).single()
        : Promise.resolve({ data: null as { before_clip_id: string; after_clip_id: string } | null }),
    user
      ? supabase.from('votes').select('technique_id, chosen_clip_id, other_description, observation').eq('test_id', test.id).eq('user_id', user.id)
      : Promise.resolve({ data: null as ExistingVote[] | null }),
    // Public vote count (via security-definer RPC — safe for all viewers)
    supabase.rpc('test_vote_count', { test_id: test.id }),
    // Listening techniques (only needed for open tests) — active techniques
    // only. Step 57 deactivated every technique except Tune Method, so this
    // now always resolves to a single entry; the query stays generic on
    // is_active rather than hardcoding "Tune Method" by name, in case a
    // technique is ever reactivated.
    !isRevealed
      ? supabase.from('listening_techniques').select('id, name, description, is_other').eq('is_active', true).order('sort_order')
      : Promise.resolve({ data: null as Technique[] | null }),
    isRevealed
      ? supabase
          .from('votes')
          .select(`
            chosen_clip_id,
            other_description,
            observation,
            technique:listening_techniques(id, name, is_other, sort_order),
            voter:users!user_id(display_name)
          `)
          .eq('test_id', test.id)
      : Promise.resolve({ data: null as RawVoteRow[] | null }),
  ])

  const existingVotes: ExistingVote[] = userVotes ?? []
  const hasVoted = existingVotes.length > 0
  const canSeeTally = isRevealed || hasVoted

  const voteCount: number = voteCountData ?? 0
  const techniques: Technique[] = allActiveTechniques ?? []

  // effectiveStatus honors an admin override (step 64) over the cron's own
  // url_status — used for every "is this clip broken" decision below
  // (warnings, badges, vote gating, Replace URL), so a correction applies
  // consistently everywhere a raw url_status check used to be made.
  const effA = effectiveUrlStatus(rawA.url_status as UrlStatus, rawA.admin_override)
  const effB = effectiveUrlStatus(rawB.url_status as UrlStatus, rawB.admin_override)

  // Clip health — dead blocks voting; degraded is a lighter-touch note only
  const hasDeadClip = effA === STATUS_DEAD || effB === STATUS_DEAD

  // Once revealed, a clip that can't be embedded gets its link folded into
  // MappingBadge's own clip slot instead of a separate box below — gated
  // on `mapping` too (matching MappingBadge's own render condition below),
  // so a hidden slot is never left with nothing to show
  const canShowMappingLinks = isRevealed && !!mapping
  const hideClipA = canShowMappingLinks && isUnsupportedClip(rawA)
  const hideClipB = canShowMappingLinks && isUnsupportedClip(rawB)

  // Vote tally — fetch all votes for this test when the viewer is entitled.
  // On an open (unrevealed) test, "votes: read own or revealed" RLS means
  // this only ever returns the CALLER's own vote row, not every voter's —
  // by design (see canSeeTally above and TallyDisplay's ownVoteOnly prop):
  // a voter sees their own choice reflected back, not the full group's,
  // until the test is officially revealed. Already fetched above when
  // revealed (canSeeTally is unconditionally true then); an open test can
  // only know canSeeTally once existingVotes resolves, so that one case
  // stays a dependent, separately-awaited query.
  let tally: TallyResult | null = null
  if (isRevealed) {
    tally = computeTally((revealedTallyRows ?? []) as RawVoteRow[], rawA.id, rawB.id)
  } else if (canSeeTally) {
    const { data } = await supabase
      .from('votes')
      .select(`
        chosen_clip_id,
        other_description,
        observation,
        technique:listening_techniques(id, name, is_other, sort_order),
        voter:users!user_id(display_name)
      `)
      .eq('test_id', test.id)
    tally = computeTally((data ?? []) as RawVoteRow[], rawA.id, rawB.id)
  }

  // Cast joined relations — Supabase returns these as arrays even for
  // singular foreign key joins; we take the first element
  const track  = Array.isArray(test.track)  ? test.track[0]  : test.track
  const creator = Array.isArray(test.creator) ? test.creator[0] : test.creator

  // Same normalization, one level deeper for snapshot_a/snapshot_b's own
  // nested system join — see lib/tests/format-snapshot-line.ts, shared with
  // the feed's identical "SystemName · label" presentation. Gated behind
  // canSeeSystemInfo (step 43) — which systems/components are under
  // comparison must not be disclosed until the test is revealed or the
  // viewer is its creator.
  function normalizeSnapshot(raw: unknown): SnapshotSummary {
    const snap = (Array.isArray(raw) ? raw[0] : raw) as
      | { label: string; system: { name: string } | { name: string }[] | null }
      | undefined
    if (!snap) return null
    const system = Array.isArray(snap.system) ? snap.system[0] : snap.system
    return { label: snap.label, system: system ?? null }
  }
  const snapshotA = canSeeSystemInfo ? normalizeSnapshot(test.snapshot_a) : null
  const snapshotB = canSeeSystemInfo ? normalizeSnapshot(test.snapshot_b) : null
  const snapshotLine = formatSnapshotLine(snapshotA, snapshotB)

  return (
    <PageShell maxWidth="4xl" spacing="responsive">

      {/* Header — richer than PageHeader's shape (eyebrow + byline with
          embedded vote count/imported badge + provenance/forum links +
          EditForumLinkButton), left as raw JSX rather than forced into a
          single-subtitle slot; see build-history/52-*.md */}
      <div className="space-y-1">
        <Text size="xs" className="font-semibold uppercase tracking-wide">
          {isRevealed ? t('revealedStatus') : t('blindStatus')}
        </Text>
        <Heading level={1}>{test.title}</Heading>
        <Text>
          {track?.artist} — {track?.title}
          {track?.album && ` (${track.album})`}
        </Text>
        {track?.passage_note && (
          <Text className="italic">{track.passage_note}</Text>
        )}
        {/* Hidden once revealed (step 65) — MappingBadge below then shows
            the same "SystemName · label" info per clip, so this generic
            unordered line would just be a duplicate. Stays visible for the
            creator's own still-blind test, the one case where MappingBadge
            isn't rendered yet. */}
        {snapshotLine && !isRevealed && (
          <Text size="xs">{snapshotLine}</Text>
        )}
        <Text size="xs">
          by {creator?.display_name ?? t('anonymous')} ·{' '}
          {new Date(test.created_at).toLocaleDateString(locale)} ·{' '}
          {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
          {isImported && (
            <>
              {' · '}
              <Badge status="imported" className="align-middle">
                {tCommon('importedBadge')}
              </Badge>
            </>
          )}
        </Text>
        {(test.source_url || creator?.is_placeholder) && (
          <Text size="xs" className="space-x-3">
            {/* source_url survives a claim (step 39) unchanged — the link
                stays useful as provenance even once the content is
                normally-owned, unlike claim-contact below, which only
                makes sense while there's still a placeholder to claim. */}
            {test.source_url && (
              <Link
                href={test.source_url}
                variant="inline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tCommon('viewOriginalPost')}
              </Link>
            )}
            {creator?.is_placeholder && <span>{tCommon('claimContact')}</span>}
          </Text>
        )}
        {/* Creator-supplied forum discussion link (step 46) — distinct from
            source_url above: hidden from non-creators until revealed
            (canSeeSystemInfo), always visible to the creator regardless of
            reveal status. Never touched by ReplaceClipUrlButton's
            voteCount === 0 gating — pure metadata, not what's being tested. */}
        {canSeeSystemInfo && test.forum_link && (
          <Text size="xs">
            <Link
              href={test.forum_link}
              variant="inline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {tForumLink('label')}
            </Link>
          </Text>
        )}
        {isCreator && (
          <EditForumLinkButton testId={test.id} currentLink={test.forum_link} />
        )}
      </div>

      {/* Reveal badge */}
      {isRevealed && mapping && (
        <MappingBadge
          clipAUnsupportedUrl={hideClipA ? rawA.source_url : null}
          clipBUnsupportedUrl={hideClipB ? rawB.source_url : null}
          snapshotA={snapshotA}
          snapshotB={snapshotB}
        />
      )}

      {/* Player — playback is public. Clip resolution (toClipData) can make
          a real blocking external fetch for a Google Photos clip (see
          ClipPlayerSection), so it's split into its own Suspense boundary
          rather than delaying everything else on the page behind it. */}
      <div className="w-full max-w-full min-w-0">
        <Suspense fallback={<ClipPlayerFallback hideClipA={hideClipA} hideClipB={hideClipB} loadingLabel={tCommon('loading')} />}>
          <ClipPlayerSection rawA={rawA} rawB={rawB} hideClipA={hideClipA} hideClipB={hideClipB} />
        </Suspense>
      </div>

      {/* Clip health warnings — safe to say which label is affected without
          leaking clip_mapping before/after identity, since url_status lives
          on the raw clip row, independent of the mapping. Uses the
          effective (override-aware) status, not the raw cron value. */}
      {effA === STATUS_DEAD && (
        <Callout tone="warning" className="text-sm">
          {t('clipHealth.deadWarning', { label: 'A' })}
        </Callout>
      )}
      {effA === STATUS_DEGRADED && (
        <Callout tone="info" className="text-sm">
          {t('clipHealth.degradedWarning', { label: 'A' })}
        </Callout>
      )}
      {effB === STATUS_DEAD && (
        <Callout tone="warning" className="text-sm">
          {t('clipHealth.deadWarning', { label: 'B' })}
        </Callout>
      )}
      {effB === STATUS_DEGRADED && (
        <Callout tone="info" className="text-sm">
          {t('clipHealth.degradedWarning', { label: 'B' })}
        </Callout>
      )}

      {/* Admin controls (step 64) — any admin, not just the test's own
          creator, can correct a clip's health status when the cron gets
          it wrong. Independent of isCreator/voteCount/isRevealed — this
          corrects a signal, not what was tested. */}
      {isAdmin && (
        <div className="flex flex-wrap gap-3">
          <AdminClipOverrideControl
            clipId={rawA.id}
            label="A"
            urlStatus={rawA.url_status as UrlStatus}
            adminOverride={rawA.admin_override}
          />
          <AdminClipOverrideControl
            clipId={rawB.id}
            label="B"
            urlStatus={rawB.url_status as UrlStatus}
            adminOverride={rawB.admin_override}
          />
        </div>
      )}

      {/* Creator controls */}
      {isCreator && (!isRevealed || voteCount === 0) && (
        <div className="flex flex-wrap gap-3">
          {!isRevealed && <RevealButton testId={test.id} />}
          {voteCount === 0 && <DeleteTestButton testId={test.id} />}
          {voteCount === 0 && effA === STATUS_DEAD && (
            <ReplaceClipUrlButton clipId={rawA.id} label="A" />
          )}
          {voteCount === 0 && effB === STATUS_DEAD && (
            <ReplaceClipUrlButton clipId={rawB.id} label="B" />
          )}
        </div>
      )}

      {/* Vote tally */}
      {canSeeTally && tally && (
        <TallyDisplay tally={tally} clipAId={rawA.id} clipBId={rawB.id} ownVoteOnly={!isRevealed} />
      )}

      {/* Vote form */}
      {user && !isRevealed && (
        <VoteForm
          testId={test.id}
          clipAId={rawA.id}
          clipBId={rawB.id}
          techniques={techniques}
          existingVotes={existingVotes}
          hasDeadClip={hasDeadClip}
        />
      )}
      {!user && !isRevealed && !hasDeadClip && (
        <Callout tone="neutral" className="p-4 sm:p-6 text-center text-sm text-muted">
          <Link href="/login">{t('signIn')}</Link>
          {' '}{t('signInToVote')}
        </Callout>
      )}

      {/* Item-to-item navigation — its id-list query is independent of
          everything above, so it's split into its own Suspense boundary
          (see TestNavFooter) instead of blocking the rest of this page on
          it. Portaled into the global footer's nav slot so it's always
          visible without scrolling (see FooterPortal). */}
      <Suspense fallback={null}>
        <TestNavFooter
          testId={test.id}
          from={from}
          fromId={fromId}
          pageParam={pageParam}
          userId={user?.id}
        />
      </Suspense>

    </PageShell>
  )
}

// Item-to-item navigation (First/Previous/Next/Last/All) — reconstructs the
// exact ordered list of test ids the originating list page (feed, track, or
// system) already established, using the identical filter and .order(...)
// shape that page uses, then reads neighbors off by array position. No new
// comparison-based "search" logic — just the same order the parent already
// determined, reused here. Pulled into its own async component (rather than
// awaited inline in TestDetailPage) so its query streams in under its own
// Suspense boundary instead of delaying the rest of the page.
async function TestNavFooter({
  testId,
  from,
  fromId,
  pageParam,
  userId,
}: {
  testId: string
  from?: string
  fromId?: string
  pageParam?: string
  userId?: string
}) {
  const supabase = await createClient()
  const t = await getTranslations('tests')

  let navIds: string[] = []

  if (from === 'feed') {
    const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
    const start = (page - 1) * FEED_PAGE_SIZE
    const end = start + FEED_PAGE_SIZE - 1
    const { data } = await supabase
      .from('tests')
      .select('id')
      .order('created_at', { ascending: false })
      .range(start, end)
    navIds = (data ?? []).map(row => row.id)
  } else if (from === 'track' && fromId) {
    const { data } = await supabase
      .from('tests')
      .select('id')
      .eq('track_id', fromId)
      .order('created_at', { ascending: false })
    navIds = (data ?? []).map(row => row.id)
  } else if (from === 'system' && fromId) {
    const { data: snaps } = await supabase
      .from('system_snapshots')
      .select('id')
      .eq('system_id', fromId)
    const snapshotIds = (snaps ?? []).map(s => s.id)
    if (snapshotIds.length > 0) {
      const { data } = await supabase
        .from('tests')
        .select('id')
        .or(`snapshot_a_id.in.(${snapshotIds.join(',')}),snapshot_b_id.in.(${snapshotIds.join(',')})`)
        .or(`status.eq.revealed,creator_id.eq.${userId ?? '00000000-0000-0000-0000-000000000000'}`)
        .order('created_at', { ascending: false })
      navIds = (data ?? []).map(row => row.id)
    }
  }

  const { prevId, nextId, firstId, lastId } = getAdjacentIds(navIds, testId)

  const navCtxSuffix =
    from === 'feed' ? `?from=feed&page=${pageParam ?? '1'}` :
    (from === 'track' || from === 'system') && fromId ? `?from=${from}&fromId=${fromId}` :
    ''

  // "All" — back to whichever list this viewer came from. Reuses the same
  // from/fromId/pageParam already resolved above; no extra query needed.
  const navBackHref =
    from === 'feed' ? `/?page=${pageParam ?? '1'}` :
    from === 'track' && fromId ? `/tracks/${fromId}` :
    from === 'system' && fromId ? `/systems/${fromId}` :
    null

  if (!navBackHref) return null

  return (
    <FooterPortal>
      <div className="flex items-center gap-3">
        <FooterNavLink
          href={firstId ? `/tests/${firstId}${navCtxSuffix}` : null}
          aria-label={t('nav.first')}
        >
          <ChevronsLeftIcon className="w-4 h-4" />
        </FooterNavLink>
        <FooterNavLink
          href={prevId ? `/tests/${prevId}${navCtxSuffix}` : null}
          aria-label={t('nav.previous')}
        >
          <ChevronLeftIcon className="w-4 h-4" />
        </FooterNavLink>
        <FooterNavLink href={navBackHref} aria-label={t('nav.all')}>
          <ListIcon className="w-4 h-4" />
        </FooterNavLink>
        <FooterNavLink
          href={nextId ? `/tests/${nextId}${navCtxSuffix}` : null}
          aria-label={t('nav.next')}
        >
          <ChevronRightIcon className="w-4 h-4" />
        </FooterNavLink>
        <FooterNavLink
          href={lastId ? `/tests/${lastId}${navCtxSuffix}` : null}
          aria-label={t('nav.last')}
        >
          <ChevronsRightIcon className="w-4 h-4" />
        </FooterNavLink>
      </div>
    </FooterPortal>
  )
}

// Resolves both clips (toClipData) and renders the actual player. Pulled
// into its own async component (rather than awaited inline in
// TestDetailPage) because toClipData makes a real blocking external HTTP
// fetch for a Google Photos clip (lib/clips/resolve-google-photos.ts, up to
// a 3s timeout) — everything else on the page only needs the raw clip row
// (rawA/rawB), not the resolved ClipData, so there's no reason to make the
// whole page wait on this.
async function ClipPlayerSection({
  rawA,
  rawB,
  hideClipA,
  hideClipB,
}: {
  rawA: RawClip
  rawB: RawClip
  hideClipA: boolean
  hideClipB: boolean
}) {
  // Promise.all rather than sequential awaits — avoids doubling worst-case
  // latency when both clips in one A/B test are Google Photos links
  // (common, since a listener often shares before/after clips from the
  // same source).
  const [clipA, clipB] = await Promise.all([toClipData(rawA), toClipData(rawB)])

  return <ABPlayer clipA={clipA} clipB={clipB} hideClipA={hideClipA} hideClipB={hideClipB} />
}

// Fallback shown while ClipPlayerSection resolves — mirrors ABPlayer's own
// "Clip A"/"Clip B" heading-per-slot layout (so nothing shifts once the
// real player mounts) with PageLoading's established spinner/role="status"
// convention in place of each player.
function ClipPlayerFallback({
  hideClipA,
  hideClipB,
  loadingLabel,
}: {
  hideClipA: boolean
  hideClipB: boolean
  loadingLabel: string
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 w-full max-w-full">
      {!hideClipA && <ClipSlotFallback label="Clip A" loadingLabel={loadingLabel} />}
      {!hideClipB && <ClipSlotFallback label="Clip B" loadingLabel={loadingLabel} />}
    </div>
  )
}

function ClipSlotFallback({ label, loadingLabel }: { label: string; loadingLabel: string }) {
  return (
    <div className="space-y-2 min-w-0">
      <ClipLabel>{label}</ClipLabel>
      <div
        className="relative w-full max-w-full aspect-video overflow-hidden rounded flex items-center justify-center bg-gray-100 dark:bg-gray-800"
        role="status"
      >
        <SpinnerIcon className="h-6 w-6 animate-spin text-gray-400" />
        <span className="sr-only">{loadingLabel}</span>
      </div>
    </div>
  )
}