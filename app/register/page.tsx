import Link from 'next/link'
import RegisterForm from '@/components/RegisterForm'
import OAuthButtons from '@/components/OAuthButtons'
import { getTranslations } from 'next-intl/server'

export default async function RegisterPage() {
  const t = await getTranslations('auth')

  return (
    <main className="h-full flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-semibold">{t('registerHeading')}</h1>
        <OAuthButtons />
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          <span className="text-xs text-gray-500 dark:text-gray-400">{t('orRegisterWithEmail')}</span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
        </div>
        <RegisterForm />
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          <Link href="/login" className="hover:underline">
            {t('backToSignIn')}
          </Link>
        </p>
      </div>
    </main>
  )
}
