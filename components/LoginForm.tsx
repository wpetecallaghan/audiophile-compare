'use client'  // This directive marks the component as a Client Component.
              // It runs in the browser and can use state, event handlers, etc.
              // Without this, Next.js assumes Server Component.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

export default function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations('auth')
  const [email, setEmail]     = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()   // prevents the browser's default form submission behaviour
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${redirectTo ?? '/'}`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSubmitted(true)
    }
  }

  if (submitted) {
    return <p className="text-sm">{t('magicLinkSent')}</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          {t('emailLabel')}
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" className="w-full">
        {t('magicLinkButton')}
      </Button>
    </form>
  )
}