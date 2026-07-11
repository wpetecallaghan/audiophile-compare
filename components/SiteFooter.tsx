import { Link } from '@/components/ui/Link'
import { getTranslations } from 'next-intl/server'
import { FOOTER_NAV_SLOT_ID } from '@/components/ui/footer-nav-slot'

export default async function SiteFooter() {
  const t = await getTranslations('footer')

  return (
    <footer className="shrink-0 border-t border-gray-100 dark:border-gray-800">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 min-h-14 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
        <div className="flex items-center gap-4">
          <Link href="/privacy" variant="nav">
            {t('privacyLink')}
          </Link>
          <Link href="/terms" variant="nav">
            {t('termsLink')}
          </Link>
        </div>
        {/* Page-specific step-through nav (feed pagination, test detail
            First/Previous/Next/Last/All) portals its content in here via
            FooterPortal, so it's always visible without scrolling. Empty
            on pages that don't use it. */}
        <div id={FOOTER_NAV_SLOT_ID} className="flex items-center gap-3" />
      </div>
    </footer>
  )
}
