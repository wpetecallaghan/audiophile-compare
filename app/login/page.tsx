import LoginTabs from '@/components/LoginTabs'
import { getTranslations } from 'next-intl/server'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const params = await searchParams
  const t = await getTranslations('auth')

  return (
    <main className="h-full flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-semibold">{t('heading')}</h1>
        <LoginTabs redirectTo={params.redirectTo} />
      </div>
    </main>
  )
}