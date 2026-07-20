import Link from 'next/link'
import ForgotPasswordForm from '@/components/ForgotPasswordForm'
import { AuthShell } from '@/components/ui/AuthShell'
import { getTranslations } from 'next-intl/server'

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth')

  return (
    <AuthShell heading={t('forgotPasswordHeading')}>
      <ForgotPasswordForm />
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        <Link href="/login" className="hover:underline">
          {t('backToSignIn')}
        </Link>
      </p>
    </AuthShell>
  )
}
