'use client'  // This directive marks the component as a Client Component.
              // It runs in the browser and can use state, event handlers, etc.
              // Without this, Next.js assumes Server Component.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'

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
        <FieldLabel htmlFor="email">
          {t('emailLabel')}
        </FieldLabel>
        <TextInput
          id="email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <Button type="submit" className="w-full">
        {t('magicLinkButton')}
      </Button>
    </form>
  )
}