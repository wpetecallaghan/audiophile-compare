'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

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
        <label htmlFor="display-name" className="block text-sm font-medium mb-1">
          {t('displayNameLabel')}
        </label>
        <input
          id="display-name"
          type="text"
          placeholder={t('displayNamePlaceholder')}
          value={displayName}
          onChange={e => { setDisplayName(e.target.value); setSuccess(false) }}
          className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-xs text-green-600">{t('successMessage')}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !displayName.trim()}
          className="rounded bg-black dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40"
        >
          {submitting ? t('saving') : t('saveButton')}
        </button>
        <Link href="/" className="border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          {t('cancelButton')}
        </Link>
      </div>
    </div>
  )
}
