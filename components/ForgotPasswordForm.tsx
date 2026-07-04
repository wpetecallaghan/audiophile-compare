'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

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
          <label htmlFor="reset-email" className="block text-sm font-medium mb-1">
            {t('emailLabel')}
          </label>
          <input
            id="reset-email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
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
