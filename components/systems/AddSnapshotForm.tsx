'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { TextInput, TextArea } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'

type Props = {
  systemId: string
}

export default function AddSnapshotForm({ systemId }: Props) {
  const router = useRouter()
  const t = useTranslations('snapshots')
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpen() {
    setOpen(true)
    setLabel('')
    setNotes('')
    setError(null)
  }

  function handleCancel() {
    setOpen(false)
    setLabel('')
    setNotes('')
    setError(null)
  }

  async function handleSubmit() {
    if (!label.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/systems/${systemId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          notes: notes.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError((body as { error?: string }).error ?? t('failedToCreate'))
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError(t('networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={handleOpen}>
        {t('addButton')}
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-sm font-medium">{t('newHeading')}</p>
      <TextInput
        type="text"
        placeholder={t('labelPlaceholder')}
        value={label}
        onChange={e => setLabel(e.target.value)}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
      <TextArea
        placeholder={t('notesPlaceholder')}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="compact"
          onClick={handleSubmit}
          disabled={submitting || !label.trim()}
        >
          {submitting ? t('adding') : t('submitButton')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          onClick={handleCancel}
          disabled={submitting}
        >
          {t('cancel')}
        </Button>
      </div>
    </div>
  )
}
