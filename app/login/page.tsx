import LoginForm from '@/components/LoginForm'
import OAuthButtons from '@/components/OAuthButtons'
import { getTranslations } from 'next-intl/server'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const params = await searchParams
  const t = await getTranslations('auth')

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-semibold">{t('heading')}</h1>
        <OAuthButtons redirectTo={params.redirectTo} />
        <div className="flex items-center gap-3">
          <hr className="flex-1 border-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <hr className="flex-1 border-gray-200" />
        </div>
        <LoginForm redirectTo={params.redirectTo} />
      </div>
    </main>
  )
}