'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'

export default function SignOutButton() {
  const router = useRouter()
  const t = useTranslations('nav')
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="text-sm text-gray-500 hover:text-gray-900 disabled:opacity-40"
    >
      {signingOut ? t('signingOut') : t('signOut')}
    </button>
  )
}
