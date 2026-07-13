import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Link } from '@/components/ui/Link'
import { Callout } from '@/components/ui/Callout'
import ABPlayer from '@/components/media/ABPlayer'
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
import { ChevronsLeftIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsRightIcon, ListIcon } from '@/components/ui/icons'
import { FooterPortal } from '@/components/ui/FooterPortal'
import { getAdjacentIds } from '@/lib/nav/get-adjacent-ids'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; fromId?: string; page?: string }>
}

export default async function TestDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { from, fromId, page: pageParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const t = await getTranslations('tests')
  const tCommon = await getTranslations('common')
  const tForumLink = await getTranslations('tests.forumLink')
  const locale = await getRequestLocale()

  const { data: test, error } = await supabase
    .from('tests')
    .select(`
      id, title, status, revealed_at, created_at, source_url, source_ref, forum_link,
      creator_id,
      creator:users!creator_id(display_name, is_placeholder),
      track:tracks(artist, title, album, passage_note),
      clips(id, label, source_url, provider, media_type, url_status, admin_override),
      snapshot_a:system_snapshots!snapshot_a_id(label, system:systems(name)),
      snapshot_b:system_snapshots!snapshot_b_id(label, system:systems(name))
    `)
    .eq('id', id)
    .single()

  if (error || !test) notFound()

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

  // clip_mapping: only fetch if entitled
  let mapping: { before_clip_id: string; after_clip_id: string } | null = null
  if (isCreator || isRevealed) {
    const { data } = await supabase
      .from('clip_mapping')
      .select('before_clip_id, after_clip_id')
      .eq('test_id', test.id)
      .single()
    mapping = data
  }

  // Vote tally visibility + public vote count
  let hasVoted = false
  let existingVotes: ExistingVote[] = []
  if (user) {
    const { data: userVotes } = await supabase
      .from('votes')
      .select('technique_id, chosen_clip_id, other_description, observation')
      .eq('test_id', test.id)
      .eq('user_id', user.id)
    existingVotes = userVotes ?? []
    hasVoted = existingVotes.length > 0
  }

  const canSeeTally = isRevealed || hasVoted

  // Public vote count (via security-definer RPC — safe for all viewers)
  const { data: voteCountData } = await supabase
    .rpc('test_vote_count', { test_id: test.id })
  const voteCount: number = voteCountData ?? 0

  // Listening techniques (only needed for open tests) — active techniques
  // only. Step 57 deactivated every technique except Tune Method, so this
  // now always resolves to a single entry; the query stays generic on
  // is_active rather than hardcoding "Tune Method" by name, in case a
  // technique is ever reactivated.
  let techniques: Technique[] = []
  if (!isRevealed) {
    const { data: allActive } = await supabase
      .from('listening_techniques')
      .select('id, name, description, is_other')
      .eq('is_active', true)
      .order('sort_order')
    techniques = allActive ?? []
  }

  // --- Shape the clips for ABPlayer ---

  const clips = test.clips as Array<{
    id: string
    label: string
    source_url: string
    provider: string
    media_type: string
    url_status: string
    admin_override: UrlStatus | null
  }>

  const rawA = clips.find(c => c.label === 'A')
  const rawB = clips.find(c => c.label === 'B')

  if (!rawA || !rawB) notFound()

  // Promise.all rather than sequential awaits — avoids doubling worst-case
  // latency when both clips in one A/B test are Google Photos links (common,
  // since a listener often shares before/after clips from the same source).
  const [clipA, clipB] = await Promise.all([toClipData(rawA), toClipData(rawB)])

  // effectiveStatus honors an admin override (step 64) over the cron's own
  // url_status — used for every "is this clip broken" decision below
  // (warnings, badges, vote gating, Replace URL), so a correction applies
  // consistently everywhere a raw url_status check used to be made.
  const effA = effectiveUrlStatus(rawA.url_status as UrlStatus, rawA.admin_override)
  const effB = effectiveUrlStatus(rawB.url_status as UrlStatus, rawB.admin_override)

  // Clip health — dead blocks voting; degraded is a lighter-touch note only
  const hasDeadClip = effA === STATUS_DEAD || effB === STATUS_DEAD

  // Once revealed, a clip that can't be embedded gets its link folded into
  // MappingBadge's Before/After label instead of a separate box below —
  // gated on `mapping` too (matching MappingBadge's own render condition
  // below), so a hidden slot is never left with nothing to show
  const canShowMappingLinks = isRevealed && !!mapping
  const hideClipA = canShowMappingLinks && isUnsupportedClip(rawA)
  const hideClipB = canShowMappingLinks && isUnsupportedClip(rawB)

  // Vote tally — fetch all votes for this test when the viewer is entitled.
  // On an open (unrevealed) test, "votes: read own or revealed" RLS means
  // this only ever returns the CALLER's own vote row, not every voter's —
  // by design (see canSeeTally above and TallyDisplay's ownVoteOnly prop):
  // a voter sees their own choice reflected back, not the full group's,
  // until the test is officially revealed.
  let tally: TallyResult | null = null
  if (canSeeTally) {
    const { data } = await supabase
      .from('votes')
      .select(`
        chosen_clip_id,
        other_description,
        observation,
        technique:listening_techniques(id, name, is_other, sort_order)
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

  // Item-to-item navigation (First/Previous/Next/Last/All) — reconstructs
  // the exact ordered list of test ids the originating list page (feed,
  // track, or system) already established, using the identical filter and
  // .order(...) shape that page uses, then reads neighbors off by array
  // position. No new comparison-based "search" logic — just the same
  // order the parent already determined, reused here.
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
    navIds = (data ?? []).map(t => t.id)
  } else if (from === 'track' && fromId) {
    const { data } = await supabase
      .from('tests')
      .select('id')
      .eq('track_id', fromId)
      .order('created_at', { ascending: false })
    navIds = (data ?? []).map(t => t.id)
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
        .or(`status.eq.revealed,creator_id.eq.${user?.id ?? '00000000-0000-0000-0000-000000000000'}`)
        .order('created_at', { ascending: false })
      navIds = (data ?? []).map(t => t.id)
    }
  }

  const { prevId, nextId, firstId, lastId } = getAdjacentIds(navIds, test.id)

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
        {snapshotLine && (
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
          clipAId={clipA.id}
          beforeClipId={mapping.before_clip_id}
          afterClipId={mapping.after_clip_id}
          clipAUnsupportedUrl={hideClipA ? rawA.source_url : null}
          clipBUnsupportedUrl={hideClipB ? rawB.source_url : null}
        />
      )}

      {/* Player — playback is public */}
      <div className="w-full max-w-full min-w-0">
        <ABPlayer clipA={clipA} clipB={clipB} hideClipA={hideClipA} hideClipB={hideClipB} />
      </div>

      {/* Clip health warnings — safe to say which label is affected without
          leaking clip_mapping before/after identity, since url_status lives
          on the raw clip row, independent of the mapping. Uses the
          effective (override-aware) status, not the raw cron value. */}
      {effA === STATUS_DEAD && (
        <Callout tone="warning" className="text-sm text-amber-800 dark:text-amber-200">
          {t('clipHealth.deadWarning', { label: 'A' })}
        </Callout>
      )}
      {effA === STATUS_DEGRADED && (
        <Callout tone="info" className="text-sm text-blue-800 dark:text-blue-200">
          {t('clipHealth.degradedWarning', { label: 'A' })}
        </Callout>
      )}
      {effB === STATUS_DEAD && (
        <Callout tone="warning" className="text-sm text-amber-800 dark:text-amber-200">
          {t('clipHealth.deadWarning', { label: 'B' })}
        </Callout>
      )}
      {effB === STATUS_DEGRADED && (
        <Callout tone="info" className="text-sm text-blue-800 dark:text-blue-200">
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
        <Callout tone="neutral" className="p-4 sm:p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <Link href="/login">{t('signIn')}</Link>
          {' '}{t('signInToVote')}
        </Callout>
      )}

      {/* Item-to-item navigation — portaled into the global footer's nav
          slot so it's always visible without scrolling (see FooterPortal);
          only rendered when we know which list to step through (see
          navIds above) */}
      {navBackHref && (
        <FooterPortal>
          <div className="flex items-center gap-3">
            {firstId && (
              <Link href={`/tests/${firstId}${navCtxSuffix}`} variant="nav" aria-label={t('nav.first')}>
                <ChevronsLeftIcon className="w-4 h-4" />
              </Link>
            )}
            {prevId && (
              <Link href={`/tests/${prevId}${navCtxSuffix}`} variant="nav" aria-label={t('nav.previous')}>
                <ChevronLeftIcon className="w-4 h-4" />
              </Link>
            )}
            <Link href={navBackHref} variant="nav" aria-label={t('nav.all')}>
              <ListIcon className="w-4 h-4" />
            </Link>
            {nextId && (
              <Link href={`/tests/${nextId}${navCtxSuffix}`} variant="nav" aria-label={t('nav.next')}>
                <ChevronRightIcon className="w-4 h-4" />
              </Link>
            )}
            {lastId && (
              <Link href={`/tests/${lastId}${navCtxSuffix}`} variant="nav" aria-label={t('nav.last')}>
                <ChevronsRightIcon className="w-4 h-4" />
              </Link>
            )}
          </div>
        </FooterPortal>
      )}

    </PageShell>
  )
}