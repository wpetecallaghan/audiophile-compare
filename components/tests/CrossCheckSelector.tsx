'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Snapshot = {
  id: string
  version: number
  label: string
}

type ClipInfo = {
  source_url: string
  provider: string
  media_type: string
}

type SharedTrack = {
  trackId: string
  track: { id: string; artist: string; title: string; album: string | null } | null
  clipForSnapshotA: ClipInfo
  clipForSnapshotB: ClipInfo
  existingTestId: string | null
}

type Props = {
  systemId: string
  snapshots: Snapshot[]
}

export default function CrossCheckSelector({ systemId, snapshots }: Props) {
  const router = useRouter()
  const t = useTranslations('crosscheck')

  const [snapshotAId, setSnapshotAId] = useState('')
  const [snapshotBId, setSnapshotBId] = useState('')
  const [results, setResults] = useState<SharedTrack[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  // Fetch shared tracks whenever both selects have a valid, distinct pair
  useEffect(() => {
    if (!snapshotAId || !snapshotBId || snapshotAId === snapshotBId) {
      setResults(null)
      setFetchError(null)
      return
    }

    let cancelled = false

    async function fetchShared() {
      setLoading(true)
      setFetchError(null)
      try {
        const res = await fetch(
          `/api/systems/${systemId}/cross-check?snapshot_a_id=${snapshotAId}&snapshot_b_id=${snapshotBId}`,
        )
        if (cancelled) return
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setFetchError((body as { error?: string }).error ?? 'Failed to fetch shared tracks')
          return
        }
        const data: SharedTrack[] = await res.json()
        if (!cancelled) setResults(data)
      } catch {
        if (!cancelled) setFetchError('Network error — please try again')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchShared()
    return () => { cancelled = true }
  }, [snapshotAId, snapshotBId, systemId])

  async function handleCreate(item: SharedTrack) {
    setCreating(item.trackId)
    setCreateError(null)

    const snapA = snapshots.find(s => s.id === snapshotAId)
    const snapB = snapshots.find(s => s.id === snapshotBId)
    const labelA = snapA ? `v${snapA.version} ${snapA.label}` : snapshotAId
    const labelB = snapB ? `v${snapB.version} ${snapB.label}` : snapshotBId

    const title = item.track
      ? `${item.track.artist} — ${item.track.title} (Cross-check: ${labelA} vs ${labelB})`
      : `Cross-check: ${labelA} vs ${labelB}`

    try {
      const res = await fetch('/api/tests/cross-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_id:          item.trackId,
          snapshot_a_id:     snapshotAId,
          snapshot_b_id:     snapshotBId,
          clip_a_source_url: item.clipForSnapshotA.source_url,
          clip_a_provider:   item.clipForSnapshotA.provider,
          clip_a_media_type: item.clipForSnapshotA.media_type,
          clip_b_source_url: item.clipForSnapshotB.source_url,
          clip_b_provider:   item.clipForSnapshotB.provider,
          clip_b_media_type: item.clipForSnapshotB.media_type,
          title,
        }),
      })

      const body = await res.json()
      if (!res.ok) {
        setCreateError((body as { error?: string }).error ?? 'Failed to create test')
        return
      }

      router.push(`/tests/${(body as { testId: string }).testId}`)
    } catch {
      setCreateError('Network error — please try again')
    } finally {
      setCreating(null)
    }
  }

  // Need at least two snapshots to form a pair
  if (snapshots.length < 2) return null

  return (
    <section className="space-y-4">
      <div className="pb-2 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-base font-semibold">{t('heading')}</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {t('description')}
          no new recording needed. Addresses the risk of successive improvements
          that are locally good but globally suboptimal.
        </p>
      </div>

      {/* Snapshot pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            className="block text-xs font-medium text-gray-500 dark:text-gray-400"
            htmlFor="cc-snap-a"
          >
            Snapshot A
          </label>
          <select
            id="cc-snap-a"
            value={snapshotAId}
            onChange={e => setSnapshotAId(e.target.value)}
            className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('choosePlaceholder')}</option>
            {snapshots.map(s => (
              <option key={s.id} value={s.id} disabled={s.id === snapshotBId}>
                v{s.version} — {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label
            className="block text-xs font-medium text-gray-500 dark:text-gray-400"
            htmlFor="cc-snap-b"
          >
            Snapshot B
          </label>
          <select
            id="cc-snap-b"
            value={snapshotBId}
            onChange={e => setSnapshotBId(e.target.value)}
            className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('choosePlaceholder')}</option>
            {snapshots.map(s => (
              <option key={s.id} value={s.id} disabled={s.id === snapshotAId}>
                v{s.version} — {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status / results */}
      {loading && (
        <p className="text-sm text-gray-400">Finding shared tracks…</p>
      )}

      {fetchError && (
        <p className="text-sm text-red-500">{fetchError}</p>
      )}

      {results !== null && !loading && (
        <>
          {results.length === 0 ? (
            <p className="text-sm text-gray-400">
              {t('noSharedTracks')}
            </p>
          ) : (
            <div className="space-y-2">
              {createError && (
                <p className="text-sm text-red-500">{createError}</p>
              )}

              {results.map(item => (
                <div
                  key={item.trackId}
                  className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 dark:border-gray-800 px-4 py-3"
                >
                  {/* Track info */}
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.track
                        ? `${item.track.artist} — ${item.track.title}`
                        : item.trackId}
                    </p>
                    {item.track?.album && (
                      <p className="text-xs text-gray-400 truncate">
                        {item.track.album}
                      </p>
                    )}
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.5">
                        A: {item.clipForSnapshotA.provider} / {item.clipForSnapshotA.media_type}
                      </span>
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.5">
                        B: {item.clipForSnapshotB.provider} / {item.clipForSnapshotB.media_type}
                      </span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="shrink-0">
                    {item.existingTestId ? (
                      <a
                        href={`/tests/${item.existingTestId}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Test exists →
                      </a>
                    ) : (
                      <button
                        onClick={() => handleCreate(item)}
                        disabled={creating === item.trackId}
                        className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creating === item.trackId ? 'Creating…' : 'Create test'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
