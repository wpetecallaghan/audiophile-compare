import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import SignOutButton from './SignOutButton'
import { getTranslations } from 'next-intl/server'

export default async function SiteHeader() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const t = await getTranslations('nav')

  return (
    <header className="border-b border-gray-100 dark:border-gray-800">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">

        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight shrink-0 hover:text-gray-600 dark:hover:text-gray-400"
          >
            {t('wordmark')}
          </Link>
          <Link href="/about" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 shrink-0">
            {t('about')}
          </Link>
        </div>

        {user ? (
          <nav className="flex items-center gap-3 sm:gap-6 min-w-0">
            <Link href="/systems" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 shrink-0">
              {t('systems')}
            </Link>
            <Link href="/tracks" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 shrink-0">
              {t('tracks')}
            </Link>
            <Link href="/profile" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 shrink-0">
              {t('profile')}
            </Link>
            <SignOutButton />
          </nav>
        ) : (
          <Link href="/login" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
            {t('signIn')}
          </Link>
        )}

      </div>
    </header>
  )
}
