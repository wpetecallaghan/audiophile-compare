import { getTranslations } from 'next-intl/server'
import { PageShell } from './PageShell'
import { SpinnerIcon } from './icons'

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
        <SpinnerIcon className="h-6 w-6 animate-spin text-gray-400" />
        <span className="sr-only">{t('loading')}</span>
      </div>
    </PageShell>
  )
}
