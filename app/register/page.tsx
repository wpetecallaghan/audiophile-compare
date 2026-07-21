import Link from 'next/link'
import RegisterForm from '@/components/RegisterForm'
import OAuthButtons from '@/components/OAuthButtons'
import { AuthShell } from '@/components/ui/AuthShell'
import { Divider } from '@/components/ui/Divider'
import { Text } from '@/components/ui/Text'
import { getTranslations } from 'next-intl/server'

export default async function RegisterPage() {
  const t = await getTranslations('auth')

  return (
    <AuthShell heading={t('registerHeading')}>
      <OAuthButtons />
      <Divider label={t('orRegisterWithEmail')} />
      <RegisterForm />
      <Text size="xs" className="text-center">
        <Link href="/login" className="hover:underline">
          {t('backToSignIn')}
        </Link>
      </Text>
    </AuthShell>
  )
}
