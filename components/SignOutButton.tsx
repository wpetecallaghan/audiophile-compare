'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTranslations } from 'next-intl'
import { linkVariants } from '@/components/ui/Link'
import { cn } from '@/components/ui/cn'

export default function SignOutButton() {
  const t = useTranslations('nav')
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className={cn(linkVariants({ variant: 'nav' }), 'disabled:opacity-40')}
    >
      {signingOut ? t('signingOut') : t('signOut')}
    </button>
  )
}
