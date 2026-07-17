import { getTranslations } from 'next-intl/server'
import { PageShell } from './PageShell'
import { SpinnerIcon } from './icons'
import { FooterPortal } from './FooterPortal'

type PageLoadingProps = {
  maxWidth: '2xl' | '4xl'
  spacing?: 'normal' | 'responsive'
  // Set for routes whose real content always shows footer step-through
  // nav once loaded (feed, tests/[id], tracks/[id]) — see the comment
  // below for why. Not a default: most loading.tsx routes never show
  // footer nav at all.
  hasFooterNav?: boolean
}

// Route-level loading.tsx fallback — shares PageShell's maxWidth/spacing so
// the skeleton matches the page it's replacing and nothing shifts once real
// content mounts.
export async function PageLoading({ maxWidth, spacing, hasFooterNav = false }: PageLoadingProps) {
  const t = await getTranslations('common')

  return (
    <PageShell maxWidth={maxWidth} spacing={spacing}>
      <div className="flex justify-center py-12" role="status">
        <SpinnerIcon className="h-6 w-6 animate-spin text-gray-400" />
        <span className="sr-only">{t('loading')}</span>
      </div>
      {/* Marks the footer nav slot non-empty immediately, before the real
          page's own FooterPortal-mounted nav exists — otherwise
          SiteFooter's mobile-only "hide Privacy/Terms when nav is
          present" rule (step 74, components.md §14) sees an empty slot
          for the whole loading phase and Privacy/Terms visibly show, then
          disappear the instant the real content mounts and replaces this
          skeleton. An empty <span> is enough: CSS :empty (which the
          group-has-[...:not(:empty)] rule keys off) only cares whether an
          element has any children at all, not whether they're visible. */}
      {hasFooterNav && (
        <FooterPortal>
          <span aria-hidden="true" />
        </FooterPortal>
      )}
    </PageShell>
  )
}
