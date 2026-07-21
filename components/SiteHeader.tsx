import { createClient } from '@/lib/supabase/server'
import NextLink from 'next/link'
import { Link } from '@/components/ui/Link'
import SignOutButton from './SignOutButton'
import { getTranslations } from 'next-intl/server'

export default async function SiteHeader() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const t = await getTranslations('nav')

  return (
    <header className="shrink-0 border-b border-divider">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">

        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <NextLink
            href="/"
            className="text-sm font-semibold tracking-tight shrink-0 hover:text-gray-600 dark:hover:text-gray-400"
          >
            {t('wordmark')}
          </NextLink>
          <Link href="/about" variant="nav" className="shrink-0">
            {t('about')}
          </Link>
        </div>

        {user ? (
          <nav className="flex items-center gap-3 sm:gap-6 min-w-0">
            <Link href="/systems" variant="nav" className="shrink-0">
              {t('systems')}
            </Link>
            <Link href="/tracks" variant="nav" className="shrink-0">
              {t('tracks')}
            </Link>
            <Link href="/profile" variant="nav" className="shrink-0">
              {t('profile')}
            </Link>
            <SignOutButton />
          </nav>
        ) : (
          <Link href="/login" variant="nav">
            {t('signIn')}
          </Link>
        )}

      </div>
    </header>
  )
}
