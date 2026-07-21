'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Link } from '@/components/ui/Link'
import { Heading } from '@/components/ui/Heading'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { Select } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'
import { Text } from '@/components/ui/Text'

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
  const tCommon = useTranslations('common')

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
        if (!cancelled) setFetchError(tCommon('networkError'))
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
      setCreateError(tCommon('networkError'))
    } finally {
      setCreating(null)
    }
  }

  // Need at least two snapshots to form a pair
  if (snapshots.length < 2) return null

  return (
    <section className="space-y-4">
      <div className="pb-2 border-b border-divider">
        <Heading level={2}>{t('heading')}</Heading>
        <Text size="xs" className="mt-0.5">
          {t('description')}
          no new recording needed. Addresses the risk of successive improvements
          that are locally good but globally suboptimal.
        </Text>
      </div>

      {/* Snapshot pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel tone="muted" htmlFor="cc-snap-a">
            Snapshot A
          </FieldLabel>
          <Select
            id="cc-snap-a"
            value={snapshotAId}
            onChange={e => setSnapshotAId(e.target.value)}
          >
            <option value="">{t('choosePlaceholder')}</option>
            {snapshots.map(s => (
              <option key={s.id} value={s.id} disabled={s.id === snapshotBId}>
                v{s.version} — {s.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <FieldLabel tone="muted" htmlFor="cc-snap-b">
            Snapshot B
          </FieldLabel>
          <Select
            id="cc-snap-b"
            value={snapshotBId}
            onChange={e => setSnapshotBId(e.target.value)}
          >
            <option value="">{t('choosePlaceholder')}</option>
            {snapshots.map(s => (
              <option key={s.id} value={s.id} disabled={s.id === snapshotAId}>
                v{s.version} — {s.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Status / results */}
      {loading && (
        <Text>Finding shared tracks…</Text>
      )}

      {fetchError && <FormMessage tone="error">{fetchError}</FormMessage>}

      {results !== null && !loading && (
        <>
          {results.length === 0 ? (
            <Text>
              {t('noSharedTracks')}
            </Text>
          ) : (
            <div className="space-y-2">
              {createError && <FormMessage tone="error">{createError}</FormMessage>}

              {results.map(item => (
                <div
                  key={item.trackId}
                  className="flex items-center justify-between gap-4 rounded border border-divider px-4 py-3"
                >
                  {/* Track info */}
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.track
                        ? `${item.track.artist} — ${item.track.title}`
                        : item.trackId}
                    </p>
                    {item.track?.album && (
                      <Text size="xs" className="truncate">
                        {item.track.album}
                      </Text>
                    )}
                    <div className="flex gap-2 mt-1">
                      <Text as="span" size="xs" className="bg-divider rounded px-1.5 py-0.5">
                        A: {item.clipForSnapshotA.provider} / {item.clipForSnapshotA.media_type}
                      </Text>
                      <Text as="span" size="xs" className="bg-divider rounded px-1.5 py-0.5">
                        B: {item.clipForSnapshotB.provider} / {item.clipForSnapshotB.media_type}
                      </Text>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="shrink-0">
                    {item.existingTestId ? (
                      <Link
                        href={`/tests/${item.existingTestId}`}
                        size="compact"
                      >
                        Test exists →
                      </Link>
                    ) : (
                      <Button
                        size="compact"
                        onClick={() => handleCreate(item)}
                        disabled={creating === item.trackId}
                      >
                        {creating === item.trackId ? 'Creating…' : 'Create test'}
                      </Button>
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
