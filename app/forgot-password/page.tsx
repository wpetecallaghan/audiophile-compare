import Link from 'next/link'
import ForgotPasswordForm from '@/components/ForgotPasswordForm'
import { AuthShell } from '@/components/ui/AuthShell'
import { Text } from '@/components/ui/Text'
import { getTranslations } from 'next-intl/server'

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth')

  return (
    <AuthShell heading={t('forgotPasswordHeading')}>
      <ForgotPasswordForm />
      <Text size="xs" className="text-center">
        <Link href="/login" className="hover:underline">
          {t('backToSignIn')}
        </Link>
      </Text>
    </AuthShell>
  )
}
