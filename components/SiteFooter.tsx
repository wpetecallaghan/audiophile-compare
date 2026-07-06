import { Link } from '@/components/ui/Link'
import { getTranslations } from 'next-intl/server'

export default async function SiteFooter() {
  const t = await getTranslations('footer')

  return (
    <footer className="shrink-0 border-t border-gray-100 dark:border-gray-800">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
        <Link href="/privacy" variant="nav">
          {t('privacyLink')}
        </Link>
        <Link href="/terms" variant="nav">
          {t('termsLink')}
        </Link>
      </div>
    </footer>
  )
}
