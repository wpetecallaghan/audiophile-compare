import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'

export default async function TermsPage() {
  const t = await getTranslations('terms')

  return (
    <main className="container mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <Heading level={1}>{t('heading')}</Heading>
      <p className="text-sm text-gray-600 dark:text-gray-300">{t('intro')}</p>

      <section className="space-y-3">
        <Heading level={2}>{t('serviceHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('serviceBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('accountHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('accountBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('contentHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('contentBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('acceptableUseHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('acceptableUseBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('warrantyHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('warrantyBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('liabilityHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('liabilityBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('endingHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('endingBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('changesHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('changesBody')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('contactHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('contactBody')}</p>
      </section>
    </main>
  )
}
