'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TestDraft } from '@/lib/types/test-creation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

type Props = {
  draft: TestDraft
  onBack: () => void
}

export default function StepPublish({ draft, onBack }: Props) {
  const t = useTranslations('tests.publishStep')
  const [title, setTitle]     = useState(draft.title)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // useRouter gives access to Next.js client-side navigation
  const router = useRouter()

  async function handlePublish() {
    if (!title.trim()) return
    setError(null)
    setLoading(true)

    const res = await fetch('/api/tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        track_id:       draft.track!.id,
        snapshot_a_id:  draft.snapshotA!.id,
        snapshot_b_id:  draft.snapshotB!.id,
        clip_a: {
          source_url:    draft.clipAUrl,
          canonical_url: draft.clipAVerified!.canonical_url,
          provider:      draft.clipAVerified!.provider,
          media_type:    draft.clipAVerified!.media_type,
          embed_id:      draft.clipAVerified!.embed_id,
        },
        clip_b: {
          source_url:    draft.clipBUrl,
          canonical_url: draft.clipBVerified!.canonical_url,
          provider:      draft.clipBVerified!.provider,
          media_type:    draft.clipBVerified!.media_type,
          embed_id:      draft.clipBVerified!.embed_id,
        },
        before_is_a: draft.beforeIsA,
      }),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Something went wrong')
      setLoading(false)
      return
    }

    // Navigate to the new test's detail page
    router.push(`/tests/${json.testId}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base sm:text-lg font-semibold">{t('heading')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Review your test, give it a title, then publish.
        </p>
      </div>

      {/* Summary */}
      <div className="rounded border dark:border-gray-700 divide-y dark:divide-gray-700 text-sm">
        <div className="px-4 py-3 space-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('trackBadge')}</p>
          <p className="font-medium">{draft.track?.artist} — {draft.track?.title}</p>
          {draft.track?.album && <p className="text-gray-500 dark:text-gray-400">{draft.track.album}</p>}
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-4">
          {(['A', 'B'] as const).map(side => {
            const snap = side === 'A' ? draft.snapshotA : draft.snapshotB
            const url  = side === 'A' ? draft.clipAUrl  : draft.clipBUrl
            const isBefore = side === 'A' ? draft.beforeIsA : !draft.beforeIsA
            return (
              <div key={side} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Clip {side} {isBefore ? '(before)' : '(after)'}
                </p>
                <p className="font-medium">v{snap?.version} — {snap?.label}</p>
                <p className="text-gray-500 dark:text-gray-400 break-all">{url}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Test title
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
          className="w-full border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!title.trim() || loading} onClick={handlePublish} className="flex-1">
          {loading ? t('publishing') : t('publishButton')}
        </Button>
      </div>
    </div>
  )
}