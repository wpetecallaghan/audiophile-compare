'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'

export default function LoginWithPasswordForm({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations('auth')
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      if (authError.message.toLowerCase().includes('email not confirmed')) {
        setError(t('emailNotConfirmed'))
      } else {
        setError(t('invalidCredentials'))
      }
      setSubmitting(false)
      return
    }

    window.location.href = redirectTo ?? '/'
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="pw-email" className="block text-sm font-medium mb-1">
          {t('emailLabel')}
        </label>
        <input
          id="pw-email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="pw-password" className="block text-sm font-medium mb-1">
          {t('passwordLabel')}
        </label>
        <input
          id="pw-password"
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-black dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40"
      >
        {submitting ? t('loggingIn') : t('loginButton')}
      </button>
    </form>
  )
}
