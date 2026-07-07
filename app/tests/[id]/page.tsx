import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Link } from '@/components/ui/Link'
import { Callout } from '@/components/ui/Callout'
import ABPlayer from '@/components/media/ABPlayer'
import RevealButton from '@/components/tests/RevealButton'
import DeleteTestButton from '@/components/tests/DeleteTestButton'
import ReplaceClipUrlButton from '@/components/tests/ReplaceClipUrlButton'
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

type Props = {
  params: Promise<{ id: string }>
}

export default async function TestDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const t = await getTranslations('tests')
  const tCommon = await getTranslations('common')

  const { data: test, error } = await supabase
    .from('tests')
    .select(`
      id, title, status, revealed_at, created_at, source_url,
      creator_id,
      creator:users!creator_id(display_name, is_placeholder),
      track:tracks(artist, title, album, passage_note),
      clips(id, label, source_url, provider, media_type, url_status)
    `)
    .eq('id', id)
    .single()

  if (error || !test) notFound()

  // --- Security decisions, server-side ---

  const isCreator  = user?.id === test.creator_id
  const isRevealed = test.status === 'revealed'

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

  // Listening techniques (only needed for open tests)
  let techniques: Technique[] = []
  if (!isRevealed) {
    const { data } = await supabase
      .from('listening_techniques')
      .select('id, name, description, is_other')
      .eq('is_active', true)
      .order('sort_order')
    techniques = data ?? []
  }

  // --- Shape the clips for ABPlayer ---

  const clips = test.clips as Array<{
    id: string
    label: string
    source_url: string
    provider: string
    media_type: string
    url_status: string
  }>

  const rawA = clips.find(c => c.label === 'A')
  const rawB = clips.find(c => c.label === 'B')

  if (!rawA || !rawB) notFound()

  const clipA = toClipData(rawA)
  const clipB = toClipData(rawB)

  // Clip health — dead blocks voting; degraded is a lighter-touch note only
  const hasDeadClip = rawA.url_status === 'dead' || rawB.url_status === 'dead'

  // Once revealed, a clip that can't be embedded gets its link folded into
  // MappingBadge's Before/After label instead of a separate box below —
  // gated on `mapping` too (matching MappingBadge's own render condition
  // below), so a hidden slot is never left with nothing to show
  const canShowMappingLinks = isRevealed && !!mapping
  const hideClipA = canShowMappingLinks && isUnsupportedClip(rawA)
  const hideClipB = canShowMappingLinks && isUnsupportedClip(rawB)

  // Vote tally — fetch all votes for this test when the viewer is entitled
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

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {isRevealed ? t('revealedStatus') : t('blindStatus')}
        </p>
        <Heading level={1}>{test.title}</Heading>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {track?.artist} — {track?.title}
          {track?.album && ` (${track.album})`}
        </p>
        {track?.passage_note && (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">{track.passage_note}</p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          by {creator?.display_name ?? t('anonymous')} ·{' '}
          {new Date(test.created_at).toLocaleDateString()} ·{' '}
          {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
          {creator?.is_placeholder && (
            <>
              {' · '}
              <Badge status="imported" className="align-middle">
                {tCommon('importedBadge')}
              </Badge>
            </>
          )}
        </p>
        {creator?.is_placeholder && (
          <p className="text-xs text-gray-500 dark:text-gray-400 space-x-3">
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
            <span>{tCommon('claimContact')}</span>
          </p>
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
          on the raw clip row, independent of the mapping */}
      {rawA.url_status === 'dead' && (
        <Callout tone="warning" className="text-sm text-amber-800 dark:text-amber-200">
          {t('clipHealth.deadWarning', { label: 'A' })}
        </Callout>
      )}
      {rawA.url_status === 'degraded' && (
        <Callout tone="info" className="text-sm text-blue-800 dark:text-blue-200">
          {t('clipHealth.degradedWarning', { label: 'A' })}
        </Callout>
      )}
      {rawB.url_status === 'dead' && (
        <Callout tone="warning" className="text-sm text-amber-800 dark:text-amber-200">
          {t('clipHealth.deadWarning', { label: 'B' })}
        </Callout>
      )}
      {rawB.url_status === 'degraded' && (
        <Callout tone="info" className="text-sm text-blue-800 dark:text-blue-200">
          {t('clipHealth.degradedWarning', { label: 'B' })}
        </Callout>
      )}

      {/* Creator controls */}
      {isCreator && (!isRevealed || voteCount === 0) && (
        <div className="flex flex-wrap gap-3">
          {!isRevealed && <RevealButton testId={test.id} />}
          {voteCount === 0 && <DeleteTestButton testId={test.id} />}
          {voteCount === 0 && rawA.url_status === 'dead' && (
            <ReplaceClipUrlButton clipId={rawA.id} label="A" />
          )}
          {voteCount === 0 && rawB.url_status === 'dead' && (
            <ReplaceClipUrlButton clipId={rawB.id} label="B" />
          )}
        </div>
      )}

      {/* Vote tally */}
      {canSeeTally && tally && (
        <TallyDisplay tally={tally} clipAId={rawA.id} clipBId={rawB.id} />
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

    </main>
  )
}