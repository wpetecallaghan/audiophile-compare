'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type Props = {
  testId: string
}

export default function RevealButton({ testId }: Props) {
  const t = useTranslations('tests.reveal')
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const router = useRouter()

  async function handleReveal() {
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/tests/${testId}/reveal`, { method: 'POST' })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong')
      setLoading(false)
      return
    }

    // Refresh the page — the server component will re-fetch with revealed status
    // router.refresh() tells Next.js to re-run server components for this page
    // without a full browser navigation
    router.refresh()
  }

  if (confirming) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-4 space-y-3">
        <p className="text-sm font-medium text-amber-900">
          {t('confirmHeading')}
        </p>
        <p className="text-sm text-amber-700">
          {t('confirmWarning')}
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleReveal}
            disabled={loading}
            className="bg-amber-600 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {loading ? t('revealing') : t('confirmButton')}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-sm text-gray-600 dark:text-gray-300 underline"
          >
            {t('cancelButton')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 rounded px-4 py-2 text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20"
    >
      {t('button')}
    </button>
  )
}