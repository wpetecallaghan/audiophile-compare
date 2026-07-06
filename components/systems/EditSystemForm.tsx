'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button, buttonVariants } from '@/components/ui/Button'
import { TextInput, TextArea } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'

type Props = {
  systemId: string
  initialName: string
  initialDescription: string | null
}

export default function EditSystemForm({ systemId, initialName, initialDescription }: Props) {
  const router = useRouter()
  const t = useTranslations('systems')
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/systems/${systemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError((body as { error?: string }).error ?? t('failedToUpdate'))
        return
      }
      router.push(`/systems/${systemId}`)
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
          placeholder={t('editNamePlaceholder')}
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
          {submitting ? t('saving') : t('saveButton')}
        </Button>
        <Link href={`/systems/${systemId}`} className={buttonVariants({ variant: 'secondary' })}>
          {t('cancel')}
        </Link>
      </div>
    </div>
  )
}
