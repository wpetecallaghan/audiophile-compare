'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'

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

    if (password.length < 8) {
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
        <label htmlFor="reg-name" className="block text-sm font-medium mb-1">
          {t('nameLabel')}
        </label>
        <input
          id="reg-name"
          type="text"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          className="w-full border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="reg-email" className="block text-sm font-medium mb-1">
          {t('emailLabel')}
        </label>
        <input
          id="reg-email"
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="reg-password" className="block text-sm font-medium mb-1">
          {t('passwordLabel')}
        </label>
        <input
          id="reg-password"
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="reg-confirm" className="block text-sm font-medium mb-1">
          {t('confirmPasswordLabel')}
        </label>
        <input
          id="reg-confirm"
          type="password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          className="w-full border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
      >
        {submitting ? t('registering') : t('registerButton')}
      </button>
    </form>
  )
}
