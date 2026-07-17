'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Link } from './Link'
import { cn } from './cn'

// Routes whose real content shows footer step-through nav (FooterPortal,
// components.md §14) — approximate for '/' and '/tests/[id]' (whether nav
// actually renders also depends on data not known until it resolves: more
// than one feed page, or a valid `from` context), exact for '/tracks/[id]'
// (its nav is unconditional). Kept as route patterns, not portaled-DOM
// state, specifically so the mobile-hide decision below is available
// synchronously — including in the very first server-rendered HTML, and
// throughout a client-side transition — rather than depending on
// FooterPortal's client-side mount/unmount timing, which has an
// unavoidable brief gap (both on initial hydration and, more visibly, on
// every subsequent navigation while the old portal unmounts and the new
// one mounts) that read as a real flicker on real mobile devices even
// though it never showed up in fast-localhost testing.
const NAV_ROUTE_PATTERNS = [/^\/$/, /^\/tests\/[^/]+$/, /^\/tracks\/[^/]+$/]

// Mobile footer space is tight — step-through navigation takes priority
// over these links there. Hidden below the `sm:` breakpoint only on
// routes that show footer nav; both links always show together at `sm:`
// and up, and both still show on mobile on routes with no nav to
// prioritize (e.g. /about).
export function FooterPrivacyLinks() {
  const pathname = usePathname()
  const t = useTranslations('footer')
  const hidesOnMobile = NAV_ROUTE_PATTERNS.some(pattern => pattern.test(pathname))

  return (
    <div
      className={cn(
        'flex items-center justify-center sm:justify-start gap-4',
        hidesOnMobile && 'max-sm:hidden',
      )}
    >
      <Link href="/privacy" variant="nav">
        {t('privacyLink')}
      </Link>
      <Link href="/terms" variant="nav">
        {t('termsLink')}
      </Link>
    </div>
  )
}
