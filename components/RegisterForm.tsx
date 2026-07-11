'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-rules'

export default function RegisterForm() {
  const t = useTranslations('auth')
  const supabase = createClient()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('passwordMinLength'))
      return
    }
    if (password !== confirm) {
      setError(t('passwordMismatch'))
      return
    }

    setSubmitting(true)

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      if (authError.message.toLowerCase().includes('already registered') ||
          authError.message.toLowerCase().includes('user already registered')) {
        setError(t('emailAlreadyRegistered'))
      } else {
        setError(authError.message)
      }
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setSubmitting(false)
  }

  if (success) {
    return <p className="text-sm">{t('registrationSuccess')}</p>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <FieldLabel htmlFor="reg-name">
          {t('nameLabel')}
        </FieldLabel>
        <TextInput
          id="reg-name"
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
        />
      </div>
      <div>
        <FieldLabel htmlFor="reg-email">
          {t('emailLabel')}
        </FieldLabel>
        <TextInput
          id="reg-email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="reg-password">
          {t('passwordLabel')}
        </FieldLabel>
        <TextInput
          id="reg-password"
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
      </div>
      <div>
        <FieldLabel htmlFor="reg-confirm">
          {t('confirmPasswordLabel')}
        </FieldLabel>
        <TextInput
          id="reg-confirm"
          type="password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
        />
      </div>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? t('registering') : t('registerButton')}
      </Button>
    </form>
  )
}
