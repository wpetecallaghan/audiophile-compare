'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

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
        <input
          type="text"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={e => setName(e.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          placeholder={t('descriptionPlaceholder')}
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="rounded bg-black dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40"
        >
          {submitting ? t('creating') : t('createButton')}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
