'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'

export default function ChangePasswordForm({ autoOpen = false }: { autoOpen?: boolean }) {
  const t = useTranslations('profile')
  const router = useRouter()
  const supabase = createClient()

  const [open, setOpen] = useState(autoOpen)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // When autoOpen (recovery flow), clean the ?reset=true query param from the URL
  useEffect(() => {
    if (autoOpen) {
      const url = new URL(window.location.href)
      url.searchParams.delete('reset')
      router.replace(url.pathname + (url.search || ''))
    }
  }, [autoOpen, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError(t('passwordMinLength'))
      return
    }
    if (password !== confirm) {
      setError(t('passwordMismatch'))
      return
    }

    setSubmitting(true)

    const { error: authError } = await supabase.auth.updateUser({ password })

    if (authError) {
      setError(authError.message)
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setPassword('')
    setConfirm('')
    setSubmitting(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-blue-600 hover:underline"
      >
        {t('changePasswordHeading')}
      </button>
    )
  }

  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="text-sm font-semibold">{t('changePasswordHeading')}</h2>
      {success ? (
        <p className="text-sm text-green-600">{t('passwordUpdated')}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium mb-1">
              {t('newPasswordLabel')}
            </label>
            <input
              id="new-password"
              type="password"
              required
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); setSuccess(false) }}
              className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="confirm-new-password" className="block text-sm font-medium mb-1">
              {t('confirmNewPasswordLabel')}
            </label>
            <input
              id="confirm-new-password"
              type="password"
              required
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(null) }}
              className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-black dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40"
          >
            {submitting ? t('updatingPassword') : t('updatePasswordButton')}
          </button>
        </form>
      )}
    </div>
  )
}
