'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { FormMessage } from '@/components/ui/FormMessage'
import type { Technique } from '@/components/tests/VoteForm'

type Props = {
  techniques: Technique[]
  initialEnabledIds: string[]
}

export default function TechniquePreferencesForm({ techniques, initialEnabledIds }: Props) {
  const t = useTranslations('profile')
  const [checked, setChecked] = useState<Set<string>>(new Set(initialEnabledIds))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSuccess(false)
  }

  async function handleSubmit() {
    if (checked.size === 0) return
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/profile/technique-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technique_ids: [...checked] }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Failed to update technique preferences')
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
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {t('techniquesDescription')}
      </p>
      <div className="space-y-2">
        {techniques.map(technique => {
          const isChecked = checked.has(technique.id)
          return (
            <label
              key={technique.id}
              className={`flex items-start gap-3 cursor-pointer rounded p-2 text-sm
                ${isChecked
                  ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
              `}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(technique.id)}
                className="mt-0.5"
              />
              <div>
                <span className="font-medium">{technique.name}</span>
                <p className="text-gray-500 dark:text-gray-400 mt-0.5">{technique.description}</p>
              </div>
            </label>
          )
        })}
      </div>
      {checked.size === 0 && <FormMessage tone="error">{t('techniquesMinError')}</FormMessage>}
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {success && <FormMessage tone="success">{t('techniquesSuccessMessage')}</FormMessage>}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || checked.size === 0}
      >
        {submitting ? t('techniquesSaving') : t('techniquesSaveButton')}
      </Button>
    </div>
  )
}
