'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

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
        <input
          type="text"
          placeholder={t('editNamePlaceholder')}
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
        <p className="text-xs text-red-500">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {submitting ? t('saving') : t('saveButton')}
        </button>
        <Link
          href={`/systems/${systemId}`}
          className="text-sm text-gray-500 hover:underline"
        >
          {t('cancel')}
        </Link>
      </div>
    </div>
  )
}
