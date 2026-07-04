'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'

export default function ChangeEmailForm() {
  const t = useTranslations('profile')
  const supabase = createClient()

  const [newEmail, setNewEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: authError } = await supabase.auth.updateUser({ email: newEmail })

    if (authError) {
      setError(authError.message)
      setSubmitting(false)
      return
    }

    setSent(true)
    setSubmitting(false)
  }

  if (sent) {
    return <FormMessage tone="success">{t('emailConfirmationSent')}</FormMessage>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <FieldLabel htmlFor="new-email">
          {t('newEmailLabel')}
        </FieldLabel>
        <TextInput
          id="new-email"
          type="email"
          required
          value={newEmail}
          onChange={e => { setNewEmail(e.target.value); setError(null) }}
          placeholder={t('newEmailPlaceholder')}
        />
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <Button type="submit" disabled={submitting || !newEmail.trim()}>
        {submitting ? t('sendingConfirmation') : t('sendConfirmationButton')}
      </Button>
    </form>
  )
}
