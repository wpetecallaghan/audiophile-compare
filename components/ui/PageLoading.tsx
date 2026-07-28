import { getTranslations } from 'next-intl/server'
import { PageShell } from './PageShell'
import { SpinnerIcon } from './icons'
import { SPINNER_CLASSES } from './class-names'

type PageLoadingProps = {
  maxWidth: '2xl' | '4xl'
  spacing?: 'normal' | 'responsive'
}

// Route-level loading.tsx fallback — shares PageShell's maxWidth/spacing so
// the skeleton matches the page it's replacing and nothing shifts once real
// content mounts.
export async function PageLoading({ maxWidth, spacing }: PageLoadingProps) {
  const t = await getTranslations('common')

  return (
    <PageShell maxWidth={maxWidth} spacing={spacing}>
      <div className="flex justify-center py-12" role="status">
        <SpinnerIcon className={SPINNER_CLASSES} />
        <span className="sr-only">{t('loading')}</span>
      </div>
    </PageShell>
  )
}
