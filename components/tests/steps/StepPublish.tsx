'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TestDraft } from '@/lib/types/test-creation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Heading } from '@/components/ui/Heading'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'
import { Text } from '@/components/ui/Text'

type Props = {
  draft: TestDraft
  onBack: () => void
}

export default function StepPublish({ draft, onBack }: Props) {
  const t = useTranslations('tests.publishStep')
  const tCommon = useTranslations('common')
  const [title, setTitle]         = useState(draft.title)
  const [forumLink, setForumLink] = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
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
        forum_link: forumLink.trim() || null,
      }),
    })

    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? tCommon('somethingWentWrong'))
      setLoading(false)
      return
    }

    // Navigate to the new test's detail page
    router.push(`/tests/${json.testId}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <Heading level={2}>{t('heading')}</Heading>
        <Text className="mt-1">
          Review your test, give it a title, then publish.
        </Text>
      </div>

      {/* Summary */}
      <div className="rounded border border-border divide-y divide-border text-sm">
        <div className="px-4 py-3 space-y-0.5">
          <Text size="xs" className="font-semibold uppercase tracking-wide">{t('trackBadge')}</Text>
          <p className="font-medium">{draft.track?.artist} — {draft.track?.title}</p>
          {draft.track?.album && <Text>{draft.track.album}</Text>}
        </div>
        <div className="px-4 py-3 grid grid-cols-2 gap-4">
          {(['A', 'B'] as const).map(side => {
            const snap = side === 'A' ? draft.snapshotA : draft.snapshotB
            const url  = side === 'A' ? draft.clipAUrl  : draft.clipBUrl
            const isBefore = side === 'A' ? draft.beforeIsA : !draft.beforeIsA
            return (
              <div key={side} className="space-y-1">
                <Text size="xs" className="font-semibold uppercase tracking-wide">
                  Clip {side} {isBefore ? '(before)' : '(after)'}
                </Text>
                <p className="font-medium">v{snap?.version} — {snap?.label}</p>
                <Text className="break-all">{url}</Text>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <FieldLabel>
          Test title
        </FieldLabel>
        <TextInput
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('titlePlaceholder')}
        />
      </div>

      <div>
        <FieldLabel htmlFor="forum-link">
          {t('forumLinkLabel')}
        </FieldLabel>
        <TextInput
          id="forum-link"
          type="url"
          value={forumLink}
          onChange={e => setForumLink(e.target.value)}
          placeholder={t('forumLinkPlaceholder')}
        />
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}

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