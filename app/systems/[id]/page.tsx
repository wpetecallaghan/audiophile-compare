import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import NextLink from 'next/link'
import { Link } from '@/components/ui/Link'
import { computeOutcome } from '@/lib/votes/compute-outcome'
import type { Outcome } from '@/lib/votes/compute-outcome'
import CrossCheckSelector from '@/components/tests/CrossCheckSelector'
import AddSnapshotForm from '@/components/systems/AddSnapshotForm'
import SnapshotSection from '@/components/systems/SnapshotSection'
import DeleteSystemButton from '@/components/systems/DeleteSystemButton'
import { Badge } from '@/components/ui/Badge'
import { buttonVariants } from '@/components/ui/Button'
import { Heading } from '@/components/ui/Heading'
import { getTranslations } from 'next-intl/server'

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
        hasDeadClip: t.clips.some(c => c.url_status === 'dead'),
      }
    })

    const wins   = testsWithOutcome.filter(t => t.outcome === 'win').length
    const losses = testsWithOutcome.filter(t => t.outcome === 'loss').length
    const draws  = testsWithOutcome.filter(t => t.outcome === 'draw').length

    return { ...snapshot, tests: testsWithOutcome, wins, losses, draws }
  })

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">

      {/* Breadcrumb */}
      <nav className="text-xs text-gray-500 dark:text-gray-400">
        <NextLink href="/systems" className="hover:underline">Systems</NextLink>
        {' / '}
        <span>{system.name}</span>
      </nav>

      {/* System header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          System
        </p>
        <div className="flex items-start justify-between gap-4">
          <Heading level={1}>{system.name}</Heading>
          {isOwner && (
            <div className="shrink-0 flex gap-3">
              <NextLink
                href={`/systems/${id}/edit`}
                className={buttonVariants({ variant: 'secondary', size: 'compact' })}
              >
                Edit
              </NextLink>
              {snapshots.length === 0 && <DeleteSystemButton systemId={id} />}
            </div>
          )}
        </div>
        {system.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{system.description}</p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {snapshots.length} {snapshots.length === 1 ? 'snapshot' : 'snapshots'}
          {owner?.is_placeholder && (
            <>
              {' · '}
              <Badge status="imported" className="align-middle">
                {tCommon('importedBadge')}
              </Badge>
            </>
          )}
        </p>
        {owner?.is_placeholder && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {tCommon('claimContact')}
          </p>
        )}
      </div>

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
        <p className="text-sm text-gray-500 dark:text-gray-400">No snapshots yet.</p>
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
              >
                {snapshot.tests.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No tests have used this snapshot yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {snapshot.tests.map(test => {
                      const badge = test.hasDeadClip
                        ? { text: 'Broken', status: 'broken' as const }
                        : outcomeLabel(test.outcome)
                      return (
                        <li key={test.id}>
                          <Link
                            href={`/tests/${test.id}`}
                            variant="card"
                            className="flex items-center justify-between"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {test.title}
                              </p>
                              {test.track && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {test.track.artist} — {test.track.title}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(test.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge status={badge.status} className="ml-4 shrink-0">
                              {badge.text}
                            </Badge>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </SnapshotSection>
            )
          })}
        </div>
      )}
    </main>
  )
}
