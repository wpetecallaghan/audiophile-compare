'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'

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
    return <p className="text-sm text-green-600">{t('emailConfirmationSent')}</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <div>
        <label htmlFor="new-email" className="block text-sm font-medium mb-1">
          {t('newEmailLabel')}
        </label>
        <input
          id="new-email"
          type="email"
          required
          value={newEmail}
          onChange={e => { setNewEmail(e.target.value); setError(null) }}
          placeholder={t('newEmailPlaceholder')}
          className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !newEmail.trim()}
        className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {submitting ? t('sendingConfirmation') : t('sendConfirmationButton')}
      </button>
    </form>
  )
}
