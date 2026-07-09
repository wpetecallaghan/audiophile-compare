'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput, Select } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { FormMessage } from '@/components/ui/FormMessage'
import { ConfirmButton } from '@/components/ui/ConfirmButton'
import { Callout } from '@/components/ui/Callout'

type Scope = 'votes' | 'content' | 'full'

type Preview = { votes: number; tests: number; systems: number }

// build-history-ingestion.md step 38 — the admin-only form calling
// POST /api/admin/erase-user-data. Two-step: preview (a read-only count,
// decision 8's "preview before destroy") must run before the destructive
// call becomes available, and that call itself is gated behind
// ConfirmButton's existing two-step confirm pattern (same component
// DeleteTestButton/RevealButton already use) — two independent
// confirmations for an irreversible action, not one.
export default function EraseUserDataForm() {
  const t = useTranslations('admin.eraseUserData')

  const [userId, setUserId] = useState('')
  const [scope, setScope] = useState<Scope>('votes')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function handlePreview() {
    setPreviewing(true)
    setPreviewError(null)
    setPreview(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/erase-user-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), scope, preview: true }),
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

  async function handleErase(): Promise<{ error?: string } | void> {
    const res = await fetch('/api/admin/erase-user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId.trim(), scope, preview: false }),
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
          <FieldLabel htmlFor="erase-user-id">{t('userIdLabel')}</FieldLabel>
          <TextInput
            id="erase-user-id"
            type="text"
            placeholder={t('userIdPlaceholder')}
            value={userId}
            onChange={e => {
              setUserId(e.target.value)
              setPreview(null)
              setResult(null)
            }}
          />
        </div>
        <div>
          <FieldLabel htmlFor="erase-scope">{t('scopeLabel')}</FieldLabel>
          <Select
            id="erase-scope"
            value={scope}
            onChange={e => {
              setScope(e.target.value as Scope)
              setPreview(null)
              setResult(null)
            }}
          >
            <option value="votes">{t('scopeVotes')}</option>
            <option value="content">{t('scopeContent')}</option>
            <option value="full">{t('scopeFull')}</option>
          </Select>
        </div>
      </div>

      {previewError && <FormMessage tone="error">{previewError}</FormMessage>}
      {result && <FormMessage tone="success">{result}</FormMessage>}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handlePreview}
          disabled={previewing || !userId.trim()}
        >
          {previewing ? t('previewing') : t('previewButton')}
        </Button>
      </div>

      {preview && (
        <Callout tone="info" className="space-y-2">
          <p className="text-sm font-medium">{t('previewHeading')}</p>
          <ul className="text-sm list-disc list-inside">
            <li>{t('previewVotes', { count: preview.votes })}</li>
            {scope !== 'votes' && <li>{t('previewTests', { count: preview.tests })}</li>}
            {scope !== 'votes' && <li>{t('previewSystems', { count: preview.systems })}</li>}
          </ul>
          <ConfirmButton
            label={t('eraseButton')}
            confirmHeading={t('confirmHeading')}
            confirmWarning={t('confirmWarning')}
            confirmLabel={t('confirmButton')}
            pendingLabel={t('erasing')}
            cancelLabel={t('cancelButton')}
            onConfirm={handleErase}
          />
        </Callout>
      )}
    </div>
  )
}
