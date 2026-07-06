import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'

export default async function PrivacyPage() {
  const t = await getTranslations('privacy')

  return (
    <main className="container mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <Heading level={1}>{t('heading')}</Heading>
      <p className="text-sm text-gray-600 dark:text-gray-300">{t('intro')}</p>

      <section className="space-y-3">
        <Heading level={2}>{t('collectHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('collectBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('useHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('useBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('thirdPartiesHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('thirdPartiesBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('cookiesHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('cookiesBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('rightsHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('rightsBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('childrenHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('childrenBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('contactHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('contactBody')}</p>
      </section>
    </main>
  )
}
