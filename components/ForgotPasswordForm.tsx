'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'

export default function ForgotPasswordForm({ onBack }: { onBack?: () => void }) {
  const t = useTranslations('auth')
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })

    if (authError) {
      setError(authError.message)
      setSubmitting(false)
      return
    }

    setSent(true)
    setSubmitting(false)
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm">{t('resetEmailSent')}</p>
        {onBack && (
          <Button type="button" variant="secondary" onClick={onBack}>
            {t('backToSignIn')}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{t('forgotPasswordHeading')}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <FieldLabel htmlFor="reset-email">
            {t('emailLabel')}
          </FieldLabel>
          <TextInput
            id="reset-email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t('sendingReset') : t('sendResetButton')}
        </Button>
      </form>
      {onBack && (
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('backToSignIn')}
        </Button>
      )}
    </div>
  )
}
