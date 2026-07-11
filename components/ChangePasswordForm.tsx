'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'
import { MIN_PASSWORD_LENGTH, isPasswordComplexEnough } from '@/lib/auth/password-rules'

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

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('passwordMinLength'))
      return
    }
    if (!isPasswordComplexEnough(password)) {
      setError(t('passwordComplexity'))
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
        <FormMessage tone="success">{t('passwordUpdated')}</FormMessage>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <FieldLabel htmlFor="new-password">
              {t('newPasswordLabel')}
            </FieldLabel>
            <TextInput
              id="new-password"
              type="password"
              required
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); setSuccess(false) }}
            />
          </div>
          <div>
            <FieldLabel htmlFor="confirm-new-password">
              {t('confirmNewPasswordLabel')}
            </FieldLabel>
            <TextInput
              id="confirm-new-password"
              type="password"
              required
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(null) }}
            />
          </div>
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <Button type="submit" disabled={submitting}>
            {submitting ? t('updatingPassword') : t('updatePasswordButton')}
          </Button>
        </form>
      )}
    </div>
  )
}
