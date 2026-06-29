import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { computeOutcome } from '@/lib/votes/compute-outcome'
import type { Outcome } from '@/lib/votes/compute-outcome'
import CrossCheckSelector from '@/components/tests/CrossCheckSelector'

type Props = {
  params: Promise<{ id: string }>
}

function outcomeLabel(outcome: Outcome) {
  switch (outcome) {
    case 'win':      return { text: 'Win',      cls: 'bg-green-100 text-green-700' }
    case 'loss':     return { text: 'Loss',     cls: 'bg-red-100 text-red-700' }
    case 'draw':     return { text: 'Draw',     cls: 'bg-gray-100 text-gray-500' }
    case 'open':     return { text: 'Blind',    cls: 'bg-amber-100 text-amber-700' }
    case 'no-votes': return { text: 'Revealed', cls: 'bg-blue-100 text-blue-700' }
  }
}

export default async function SystemDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch system with all its snapshots
  const { data: system, error } = await supabase
    .from('systems')
    .select(`
      id, name, description,
      system_snapshots(id, version, label, notes, components, created_at)
    `)
    .eq('id', id)
    .single()

  if (error || !system) notFound()

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
    clips: { id: string; label: string }[]
  }

  let allTests: TestRow[] = []

  if (snapshotIds.length > 0) {
    const { data: tests } = await supabase
      .from('tests')
      .select(`
        id, title, status, created_at,
        snapshot_a_id, snapshot_b_id,
        track:tracks(artist, title),
        clips(id, label)
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
      }
    })

    const wins   = testsWithOutcome.filter(t => t.outcome === 'win').length
    const losses = testsWithOutcome.filter(t => t.outcome === 'loss').length
    const draws  = testsWithOutcome.filter(t => t.outcome === 'draw').length

    return { ...snapshot, tests: testsWithOutcome, wins, losses, draws }
  })

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8">

      {/* Breadcrumb */}
      <nav className="text-xs text-gray-400">
        <Link href="/systems" className="hover:underline">Systems</Link>
        {' / '}
        <span>{system.name}</span>
      </nav>

      {/* System header */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          System
        </p>
        <h1 className="text-xl sm:text-2xl font-semibold">{system.name}</h1>
        {system.description && (
          <p className="text-sm text-gray-500">{system.description}</p>
        )}
        <p className="text-xs text-gray-400">
          {snapshots.length} {snapshots.length === 1 ? 'snapshot' : 'snapshots'}
        </p>
      </div>

      {/* Per-snapshot sections */}
      {snapshotsWithHistory.length === 0 ? (
        <p className="text-sm text-gray-400">No snapshots yet.</p>
      ) : (
        <div className="space-y-8">
          {snapshotsWithHistory.map(snapshot => {
            const hasRevealedTests = snapshot.wins + snapshot.losses + snapshot.draws > 0

            type ComponentRow = {
              role?: string
              make?: string
              model?: string
              notes?: string
            }
            const components = snapshot.components as ComponentRow[] | null

            return (
              <section key={snapshot.id} className="space-y-4">
                {/* Snapshot header */}
                <div className="flex items-start justify-between gap-4 pb-2 border-b border-gray-100">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        v{snapshot.version}
                      </span>
                      <h2 className="text-base font-semibold">{snapshot.label}</h2>
                    </div>
                    {snapshot.notes && (
                      <p className="text-xs text-gray-400">{snapshot.notes}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {new Date(snapshot.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Win/loss record */}
                  {hasRevealedTests && (
                    <div className="shrink-0 flex gap-3 text-xs font-medium">
                      {snapshot.wins > 0 && (
                        <span className="text-green-700">
                          {snapshot.wins}W
                        </span>
                      )}
                      {snapshot.losses > 0 && (
                        <span className="text-red-600">
                          {snapshot.losses}L
                        </span>
                      )}
                      {snapshot.draws > 0 && (
                        <span className="text-gray-500">
                          {snapshot.draws}D
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Component list */}
                {components && components.length > 0 && (
                  <ul className="space-y-0.5">
                    {components.map((c, i) => (
                      <li key={i} className="text-xs text-gray-500">
                        <span className="text-gray-400 w-20 inline-block">
                          {c.role}
                        </span>
                        {c.make} {c.model}
                        {c.notes && (
                          <span className="text-gray-400"> — {c.notes}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Tests for this snapshot */}
                {snapshot.tests.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No tests have used this snapshot yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {snapshot.tests.map(test => {
                      const badge = outcomeLabel(test.outcome)
                      return (
                        <li key={test.id}>
                          <Link
                            href={`/tests/${test.id}`}
                            className="flex items-center justify-between rounded border border-gray-200 px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {test.title}
                              </p>
                              {test.track && (
                                <p className="text-xs text-gray-400 truncate">
                                  {test.track.artist} — {test.track.title}
                                </p>
                              )}
                              <p className="text-xs text-gray-400">
                                {new Date(test.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <span
                              className={`ml-4 shrink-0 text-xs px-2 py-0.5 rounded-full ${badge.cls}`}
                            >
                              {badge.text}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      {/* Cross-check: compare any two snapshots using existing recordings */}
      {snapshots.length >= 2 && (
        <CrossCheckSelector
          systemId={id}
          snapshots={snapshots.map(s => ({ id: s.id, version: s.version, label: s.label }))}
        />
      )}
    </main>
  )
}
