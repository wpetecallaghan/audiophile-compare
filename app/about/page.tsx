import { Link } from '@/components/ui/Link'
import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'

export default async function AboutPage() {
  const t = await getTranslations('about')

  return (
    <main className="container mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <Heading level={1}>{t('heading')}</Heading>

      <section className="space-y-3">
        <Heading level={2}>{t('whyHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('whyBody1')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('whyBody2')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('listenersHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('listenersBody1')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('listenersBody2')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('listenersBody3')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('creatorsHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('creatorsBody1')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('creatorsBody2')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('creatorsBody3')}</p>
      </section>

      <section className="space-y-3">
        <Heading level={2}>{t('gettingStartedHeading')}</Heading>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('gettingStartedBody')}</p>
        <div className="flex items-center gap-4">
          <Link href="/register">
            {t('registerCta')}
          </Link>
          <Link href="/login">
            {t('signInCta')}
          </Link>
        </div>
      </section>
    </main>
  )
}
