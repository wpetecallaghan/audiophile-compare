'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { FormMessage } from '@/components/ui/FormMessage'
import { ConfirmButton } from '@/components/ui/ConfirmButton'
import { Callout } from '@/components/ui/Callout'

type Preview = { systems: number; tests: number; tracks: number; comments: number; votes: number }

// build-history-ingestion.md step 39 — the admin-only form calling
// POST /api/admin/claim. Two-step: preview (a read-only count, decision
// 9) must run before the destructive call becomes available, and that
// call itself is gated behind ConfirmButton's existing two-step confirm
// pattern — same shape as EraseUserDataForm.tsx, reused directly rather
// than invented fresh, since a claim is equally hard to reverse (no
// "un-merge" once the placeholder's public.users/auth.users are gone).
export default function ClaimPlaceholderForm() {
  const t = useTranslations('admin.claim')

  const [placeholderUserId, setPlaceholderUserId] = useState('')
  const [realUserId, setRealUserId] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  function resetOutcome() {
    setPreview(null)
    setPreviewError(null)
    setResult(null)
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreviewError(null)
    setPreview(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeholderUserId: placeholderUserId.trim(),
          realUserId: realUserId.trim(),
          preview: true,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setPreviewError((body as { error?: string }).error ?? t('networkError'))
        return
      }
      setPreview((body as { preview: Preview }).preview)
    } catch {
      setPreviewError(t('networkError'))
    } finally {
      setPreviewing(false)
    }
  }

  async function handleClaim(): Promise<{ error?: string } | void> {
    const res = await fetch('/api/admin/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeholderUserId: placeholderUserId.trim(),
        realUserId: realUserId.trim(),
        preview: false,
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      return { error: (body as { error?: string }).error ?? t('networkError') }
    }
    setPreview(null)
    setResult(t('successMessage'))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <FieldLabel htmlFor="claim-placeholder-id">{t('placeholderUserIdLabel')}</FieldLabel>
          <TextInput
            id="claim-placeholder-id"
            type="text"
            placeholder={t('userIdPlaceholder')}
            value={placeholderUserId}
            onChange={e => {
              setPlaceholderUserId(e.target.value)
              resetOutcome()
            }}
          />
        </div>
        <div>
          <FieldLabel htmlFor="claim-real-id">{t('realUserIdLabel')}</FieldLabel>
          <TextInput
            id="claim-real-id"
            type="text"
            placeholder={t('userIdPlaceholder')}
            value={realUserId}
            onChange={e => {
              setRealUserId(e.target.value)
              resetOutcome()
            }}
          />
        </div>
      </div>

      {previewError && <FormMessage tone="error">{previewError}</FormMessage>}
      {result && <FormMessage tone="success">{result}</FormMessage>}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handlePreview}
          disabled={previewing || !placeholderUserId.trim() || !realUserId.trim()}
        >
          {previewing ? t('previewing') : t('previewButton')}
        </Button>
      </div>

      {preview && (
        <Callout tone="info" className="space-y-2">
          <p className="text-sm font-medium">{t('previewHeading')}</p>
          <ul className="text-sm list-disc list-inside">
            <li>{t('previewSystems', { count: preview.systems })}</li>
            <li>{t('previewTests', { count: preview.tests })}</li>
            <li>{t('previewTracks', { count: preview.tracks })}</li>
            <li>{t('previewComments', { count: preview.comments })}</li>
            <li>{t('previewVotes', { count: preview.votes })}</li>
          </ul>
          <ConfirmButton
            label={t('claimButton')}
            confirmHeading={t('confirmHeading')}
            confirmWarning={t('confirmWarning')}
            confirmLabel={t('confirmButton')}
            pendingLabel={t('claiming')}
            cancelLabel={t('cancelButton')}
            onConfirm={handleClaim}
          />
        </Callout>
      )}
    </div>
  )
}
