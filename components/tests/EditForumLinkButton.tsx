'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'

type Props = {
  testId: string
  currentLink: string | null
}

// Creator-only add/edit for a test's optional forum discussion link
// (step 46) — mirrors ReplaceClipUrlButton.tsx's open/toggle/
// router.refresh() shape, but simpler: a plain URL input, no
// verify-then-persist flow, since this link is only ever displayed, never
// played back. Deliberately rendered outside the reveal/vote-gated
// creator-controls block on the test detail page — editable any time,
// unlike a clip URL swap.
export default function EditForumLinkButton({ testId, currentLink }: Props) {
  const t = useTranslations('tests.forumLink')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [open, setOpen]   = useState(false)
  const [url, setUrl]     = useState(currentLink ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/tests/${testId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forum_link: url.trim() || null }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? tCommon('somethingWentWrong'))
      setSaving(false)
      return
    }

    router.refresh()
    setOpen(false)
    setSaving(false)
  }

  if (open) {
    return (
      <Callout tone="neutral" className="space-y-3 w-full">
        <div>
          <FieldLabel htmlFor="forum-link-input">{t('label')}</FieldLabel>
          <TextInput
            id="forum-link-input"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={t('placeholder')}
          />
        </div>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('saveButton')}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
            {t('cancelButton')}
          </Button>
        </div>
      </Callout>
    )
  }

  return (
    <Button variant="secondary" onClick={() => setOpen(true)}>
      {currentLink ? t('editButton') : t('addButton')}
    </Button>
  )
}
