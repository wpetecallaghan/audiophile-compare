import Link from 'next/link'
import LoginWithPasswordForm from '@/components/LoginWithPasswordForm'
import OAuthButtons from '@/components/OAuthButtons'
import { AuthShell } from '@/components/ui/AuthShell'
import { Divider } from '@/components/ui/Divider'
import { Text } from '@/components/ui/Text'
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
        <Text as="span" size="xs" className="block">
          <Link href="/forgot-password" className="hover:underline">
            {t('forgotPasswordLink')}
          </Link>
        </Text>
      </div>
      <Text size="xs" className="text-center">
        <Link href="/register" className="hover:underline">
          {t('registerLink')}
        </Link>
      </Text>
    </AuthShell>
  )
}
