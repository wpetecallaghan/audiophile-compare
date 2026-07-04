'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { TextInput, TextArea } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'

export default function CreateSystemForm() {
  const router = useRouter()
  const t = useTranslations('systems')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/systems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError((body as { error?: string }).error ?? t('failedToCreate'))
        return
      }
      const { system } = body as { system: { id: string } }
      router.push(`/systems/${system.id}`)
    } catch {
      setError(t('networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-3">
        <TextInput
          type="text"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={e => setName(e.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
        <TextArea
          placeholder={t('descriptionPlaceholder')}
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSubmit} disabled={submitting || !name.trim()}>
          {submitting ? t('creating') : t('createButton')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          {t('cancel')}
        </Button>
      </div>
    </div>
  )
}
