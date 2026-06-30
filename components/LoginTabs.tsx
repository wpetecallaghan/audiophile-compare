'use client'

import { useState } from 'react'
import Link from 'next/link'
import LoginWithPasswordForm from '@/components/LoginWithPasswordForm'
import LoginForm from '@/components/LoginForm'
import OAuthButtons from '@/components/OAuthButtons'
import ForgotPasswordForm from '@/components/ForgotPasswordForm'
import { useTranslations } from 'next-intl'

type Tab = 'password' | 'magic' | 'google'

export default function LoginTabs({ redirectTo }: { redirectTo?: string }) {
  const t = useTranslations('auth')
  const [tab, setTab] = useState<Tab>('password')
  const [showForgot, setShowForgot] = useState(false)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'password', label: t('tabs.password') },
    { id: 'magic',    label: t('tabs.magicLink') },
    { id: 'google',   label: t('tabs.google') },
  ]

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTab(id); setShowForgot(false) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-black text-black dark:border-white dark:text-white'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'password' && (
        <div className="space-y-4">
          {showForgot ? (
            <ForgotPasswordForm onBack={() => setShowForgot(false)} />
          ) : (
            <>
              <LoginWithPasswordForm redirectTo={redirectTo} />
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-xs text-gray-500 hover:underline"
              >
                {t('forgotPasswordLink')}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'magic' && (
        <LoginForm redirectTo={redirectTo} />
      )}

      {tab === 'google' && (
        <OAuthButtons redirectTo={redirectTo} />
      )}

      {/* Register link */}
      <p className="text-center text-xs text-gray-500">
        <Link href="/register" className="hover:underline">
          {t('registerLink')}
        </Link>
      </p>
    </div>
  )
}
