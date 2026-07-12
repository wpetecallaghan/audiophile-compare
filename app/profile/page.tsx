import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from '@/components/ProfileForm'
import ChangeEmailForm from '@/components/ChangeEmailForm'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/components/ui/Link'
import { PageShell } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import { Section } from '@/components/ui/Section'
import { isAdminEmail } from '@/lib/admin/is-admin-email'

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirectTo=/profile')

  const params = await searchParams
  const t = await getTranslations('profile')
  const tEraseUserData = await getTranslations('admin.eraseUserData')
  const tClaim = await getTranslations('admin.claim')
  const isAdmin = isAdminEmail(user.email)

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, email')
    .eq('id', user.id)
    .single()

  return (
    <PageShell maxWidth="4xl">
      <PageHeader title={t('heading')} subtitle={profile?.email} />

      {/* Display name */}
      <Section>
        <ProfileForm initialDisplayName={profile?.display_name ?? ''} />
      </Section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Change email */}
      <Section>
        <h2 className="text-sm font-semibold">{t('changeEmailHeading')}</h2>
        <ChangeEmailForm />
      </Section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Change password */}
      <Section>
        <ChangePasswordForm autoOpen={params.reset === 'true'} />
      </Section>

      {isAdmin && (
        <>
          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Admin — build step 41. Link labels reuse each admin page's own
              heading string rather than duplicating the copy, so they can
              never drift from what those pages call themselves. */}
          <Section heading={t('adminHeading')}>
            <div className="flex flex-col items-start gap-2">
              <Link href="/admin/erase-user-data">{tEraseUserData('heading')}</Link>
              <Link href="/admin/claim">{tClaim('heading')}</Link>
            </div>
          </Section>
        </>
      )}
    </PageShell>
  )
}
