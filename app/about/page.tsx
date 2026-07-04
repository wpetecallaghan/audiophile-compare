import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function AboutPage() {
  const t = await getTranslations('about')

  return (
    <main className="container mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <h1 className="text-xl sm:text-2xl font-semibold">{t('heading')}</h1>

      <section className="space-y-3">
        <h2 className="text-base sm:text-lg font-semibold">{t('whyHeading')}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('whyBody1')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('whyBody2')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base sm:text-lg font-semibold">{t('listenersHeading')}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('listenersBody1')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('listenersBody2')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('listenersBody3')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base sm:text-lg font-semibold">{t('creatorsHeading')}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('creatorsBody1')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('creatorsBody2')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('creatorsBody3')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base sm:text-lg font-semibold">{t('gettingStartedHeading')}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('gettingStartedBody')}</p>
        <div className="flex items-center gap-4">
          <Link href="/register" className="text-sm text-blue-600 hover:underline">
            {t('registerCta')}
          </Link>
          <Link href="/login" className="text-sm text-blue-600 hover:underline">
            {t('signInCta')}
          </Link>
        </div>
      </section>
    </main>
  )
}
