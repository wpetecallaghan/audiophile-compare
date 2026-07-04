import Link from 'next/link'
import RegisterForm from '@/components/RegisterForm'
import { getTranslations } from 'next-intl/server'

export default async function RegisterPage() {
  const t = await getTranslations('auth')

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-semibold">{t('registerHeading')}</h1>
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
