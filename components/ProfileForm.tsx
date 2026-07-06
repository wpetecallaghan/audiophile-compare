'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button, buttonVariants } from '@/components/ui/Button'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'

type Props = {
  initialDisplayName: string
}

export default function ProfileForm({ initialDisplayName }: Props) {
  const t = useTranslations('profile')
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit() {
    if (!displayName.trim()) return
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: displayName.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Failed to update profile')
        return
      }
      setSuccess(true)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <FieldLabel htmlFor="display-name">
          {t('displayNameLabel')}
        </FieldLabel>
        <TextInput
          id="display-name"
          type="text"
          placeholder={t('displayNamePlaceholder')}
          value={displayName}
          onChange={e => { setDisplayName(e.target.value); setSuccess(false) }}
        />
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {success && <FormMessage tone="success">{t('successMessage')}</FormMessage>}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !displayName.trim()}
        >
          {submitting ? t('saving') : t('saveButton')}
        </Button>
        <Link href="/" className={buttonVariants({ variant: 'secondary' })}>
          {t('cancelButton')}
        </Link>
      </div>
    </div>
  )
}
