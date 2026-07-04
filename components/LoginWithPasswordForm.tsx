'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'

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
        <FieldLabel htmlFor="pw-email">
          {t('emailLabel')}
        </FieldLabel>
        <TextInput
          id="pw-email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="pw-password">
          {t('passwordLabel')}
        </FieldLabel>
        <TextInput
          id="pw-password"
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? t('loggingIn') : t('loginButton')}
      </Button>
    </form>
  )
}
