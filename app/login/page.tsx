import Link from 'next/link'
import LoginWithPasswordForm from '@/components/LoginWithPasswordForm'
import OAuthButtons from '@/components/OAuthButtons'
import { AuthShell } from '@/components/ui/AuthShell'
import { Divider } from '@/components/ui/Divider'
import { getTranslations } from 'next-intl/server'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const params = await searchParams
  const t = await getTranslations('auth')

  return (
    <AuthShell heading={t('heading')}>
      <OAuthButtons redirectTo={params.redirectTo} />
      <Divider label={t('orSignInWithEmail')} />
      <div className="space-y-4">
        <LoginWithPasswordForm redirectTo={params.redirectTo} />
        <Link
          href="/forgot-password"
          className="block text-xs text-gray-500 dark:text-gray-400 hover:underline"
        >
          {t('forgotPasswordLink')}
        </Link>
      </div>
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        <Link href="/register" className="hover:underline">
          {t('registerLink')}
        </Link>
      </p>
    </AuthShell>
  )
}
