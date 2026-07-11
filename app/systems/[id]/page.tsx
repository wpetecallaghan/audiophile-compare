import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import NextLink from 'next/link'
import { computeOutcome } from '@/lib/votes/compute-outcome'
import type { Outcome } from '@/lib/votes/compute-outcome'
import CrossCheckSelector from '@/components/tests/CrossCheckSelector'
import AddSnapshotForm from '@/components/systems/AddSnapshotForm'
import SnapshotSection from '@/components/systems/SnapshotSection'
import DeleteSystemButton from '@/components/systems/DeleteSystemButton'
import { Badge } from '@/components/ui/Badge'
import { buttonVariants } from '@/components/ui/Button'
import { PageShell } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import { RowCard } from '@/components/ui/RowCard'
import { Text } from '@/components/ui/Text'
import { getTranslations } from 'next-intl/server'
import { getRequestLocale } from '@/lib/dates/get-request-locale'
import { STATUS_DEAD } from '@/lib/clips/check-url'

type Props = {
  params: Promise<{ id: string }>
}

// Canonical status → Badge mapping — the color pairing itself now lives in
// components/ui/Badge.tsx, not duplicated here.
function outcomeLabel(outcome: Outcome) {
  switch (outcome) {
    case 'win':      return { text: 'Win',      status: 'win' as const }
    case 'loss':     return { text: 'Loss',     status: 'loss' as const }
    case 'draw':     return { text: 'Draw',     status: 'draw' as const }
    case 'open':     return { text: 'Blind',    status: 'blind' as const }
    case 'no-votes': return { text: 'Revealed', status: 'revealed' as const }
  }
}

export default async function SystemDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const tCommon = await getTranslations('common')
  const locale = await getRequestLocale()

  // Fetch system with all its snapshots
  const { data: system, error } = await supabase
    .from('systems')
    .select(`
      id, name, description, owner_id,
      owner:users!owner_id(is_placeholder),
      system_snapshots(id, version, label, notes, components, created_at)
    `)
    .eq('id', id)
    .single()

  if (error || !system) notFound()

  const isOwner = user?.id === (system as unknown as { owner_id: string }).owner_id
  const rawOwner = (system as unknown as { owner: { is_placeholder: boolean } | { is_placeholder: boolean }[] }).owner
  const owner = Array.isArray(rawOwner) ? rawOwner[0] : rawOwner

  type SnapshotRow = {
    id: string
    version: number
    label: string
    notes: string | null
    components: unknown
    created_at: string
  }

  const snapshots = (system.system_snapshots as SnapshotRow[]).sort(
    (a, b) => b.version - a.version,
  )

  const snapshotIds = snapshots.map(s => s.id)

  // Fetch all tests that reference any snapshot in this system
  type TestRow = {
    id: string
    title: string
    status: string
    created_at: string
    snapshot_a_id: string
    snapshot_b_id: string
    track: { artist: string; title: string } | { artist: string; title: string }[]
    clips: { id: string; label: string; url_status: string }[]
  }

  let allTests: TestRow[] = []

  if (snapshotIds.length > 0) {
    // Which systems/components are under comparison must not be disclosed
    // until a test is revealed or the viewer is its creator (step 43) — a
    // blind test involving one of this system's snapshots is excluded
    // entirely here (whole row, not a redacted field), since this page is
    // reachable by any logged-in user, not just the system's owner.
    const { data: tests } = await supabase
      .from('tests')
      .select(`
        id, title, status, created_at,
        snapshot_a_id, snapshot_b_id,
        track:tracks(artist, title),
        clips(id, label, url_status)
      `)
      .or(
        `snapshot_a_id.in.(${snapshotIds.join(',')}),snapshot_b_id.in.(${snapshotIds.join(',')})`,
      )
      .or(`status.eq.revealed,creator_id.eq.${user?.id ?? '00000000-0000-0000-0000-000000000000'}`)
      .order('created_at', { ascending: false })

    allTests = (tests ?? []) as TestRow[]
  }

  // Fetch curated votes for revealed tests (needed for win/loss)
  const revealedTestIds = allTests
    .filter(t => t.status === 'revealed')
    .map(t => t.id)

  const votesByTest = new Map<string, { chosen_clip_id: string }[]>()

  if (revealedTestIds.length > 0) {
    const { data: votes } = await supabase
      .from('votes')
      .select(`
        test_id,
        chosen_clip_id,
        technique:listening_techniques(is_other)
      `)
      .in('test_id', revealedTestIds)

    for (const vote of votes ?? []) {
      const tech = Array.isArray(vote.technique)
        ? vote.technique[0]
        : vote.technique
      if (tech?.is_other) continue // exclude "Other" from win/loss

      const list = votesByTest.get(vote.test_id) ?? []
      list.push({ chosen_clip_id: vote.chosen_clip_id })
      votesByTest.set(vote.test_id, list)
    }
  }

  // Build per-snapshot history with outcomes
  const snapshotsWithHistory = snapshots.map(snapshot => {
    const snapshotTests = allTests.filter(
      t =>
        t.snapshot_a_id === snapshot.id || t.snapshot_b_id === snapshot.id,
    )

    const testsWithOutcome = snapshotTests.map(t => {
      const track = Array.isArray(t.track) ? t.track[0] : t.track
      return {
        id: t.id,
        title: t.title,
        status: t.status,
        created_at: t.created_at,
        track,
        outcome: computeOutcome(t, snapshot.id, votesByTest),
        hasDeadClip: t.clips.some(c => c.url_status === STATUS_DEAD),
      }
    })

    const wins   = testsWithOutcome.filter(t => t.outcome === 'win').length
    const losses = testsWithOutcome.filter(t => t.outcome === 'loss').length
    const draws  = testsWithOutcome.filter(t => t.outcome === 'draw').length

    return { ...snapshot, tests: testsWithOutcome, wins, losses, draws }
  })

  return (
    <PageShell maxWidth="4xl">

      {/* Breadcrumb */}
      <nav className="text-xs text-gray-500 dark:text-gray-400">
        <NextLink href="/systems" className="hover:underline">Systems</NextLink>
        {' / '}
        <span>{system.name}</span>
      </nav>

      <PageHeader
        eyebrow="System"
        title={system.name}
        subtitle={system.description}
        actions={isOwner && (
          <>
            <NextLink
              href={`/systems/${id}/edit`}
              className={buttonVariants({ variant: 'secondary', size: 'compact' })}
            >
              Edit
            </NextLink>
            {snapshots.length === 0 && <DeleteSystemButton systemId={id} />}
          </>
        )}
      >
        <Text size="xs">
          {snapshots.length} {snapshots.length === 1 ? 'snapshot' : 'snapshots'}
          {owner?.is_placeholder && (
            <>
              {' · '}
              <Badge status="imported" className="align-middle">
                {tCommon('importedBadge')}
              </Badge>
            </>
          )}
        </Text>
        {owner?.is_placeholder && (
          <Text size="xs">{tCommon('claimContact')}</Text>
        )}
      </PageHeader>

      {/* Actions: add snapshot (owner only) + cross-check (when ≥2 snapshots exist) */}
      {isOwner && <AddSnapshotForm systemId={id} />}
      {snapshots.length >= 2 && (
        <CrossCheckSelector
          systemId={id}
          snapshots={snapshots.map(s => ({ id: s.id, version: s.version, label: s.label }))}
        />
      )}

      {/* Per-snapshot sections */}
      {snapshotsWithHistory.length === 0 ? (
        <Text>No snapshots yet.</Text>
      ) : (
        <div className="space-y-6">
          {snapshotsWithHistory.map(snapshot => {
            type ComponentRow = {
              role?: string
              make?: string
              model?: string
              notes?: string
            }
            const components = snapshot.components as ComponentRow[] | null

            return (
              <SnapshotSection
                key={snapshot.id}
                systemId={id}
                snapshot={{
                  id: snapshot.id,
                  version: snapshot.version,
                  label: snapshot.label,
                  notes: snapshot.notes,
                  components,
                  created_at: snapshot.created_at,
                }}
                wins={snapshot.wins}
                losses={snapshot.losses}
                draws={snapshot.draws}
                testCount={snapshot.tests.length}
                isOwner={isOwner}
                locale={locale}
              >
                {snapshot.tests.length === 0 ? (
                  <Text size="xs">No tests have used this snapshot yet.</Text>
                ) : (
                  <ul className="space-y-2">
                    {snapshot.tests.map(test => {
                      const badge = test.hasDeadClip
                        ? { text: 'Broken', status: 'broken' as const }
                        : outcomeLabel(test.outcome)
                      return (
                        <RowCard
                          key={test.id}
                          href={`/tests/${test.id}?from=system&fromId=${id}`}
                          title={test.title}
                          subtitle={
                            <>
                              {test.track && (
                                <Text size="xs" className="truncate">
                                  {test.track.artist} — {test.track.title}
                                </Text>
                              )}
                              <Text size="xs">
                                {new Date(test.created_at).toLocaleDateString(locale)}
                              </Text>
                            </>
                          }
                          trailing={<Badge status={badge.status}>{badge.text}</Badge>}
                        />
                      )
                    })}
                  </ul>
                )}
              </SnapshotSection>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
