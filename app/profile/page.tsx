import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from '@/components/ProfileForm'
import ChangeEmailForm from '@/components/ChangeEmailForm'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'
import { Link } from '@/components/ui/Link'
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
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <div className="space-y-1">
        <Heading level={1}>{t('heading')}</Heading>
        {profile?.email && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
        )}
      </div>

      {/* Display name */}
      <section className="space-y-3">
        <ProfileForm initialDisplayName={profile?.display_name ?? ''} />
      </section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Change email */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t('changeEmailHeading')}</h2>
        <ChangeEmailForm />
      </section>

      <hr className="border-gray-100 dark:border-gray-800" />

      {/* Change password */}
      <section className="space-y-3">
        <ChangePasswordForm autoOpen={params.reset === 'true'} />
      </section>

      {isAdmin && (
        <>
          <hr className="border-gray-100 dark:border-gray-800" />

          {/* Admin — build step 41. Link labels reuse each admin page's own
              heading string rather than duplicating the copy, so they can
              never drift from what those pages call themselves. */}
          <section className="space-y-3">
            <Heading level={2}>{t('adminHeading')}</Heading>
            <div className="flex flex-col items-start gap-2">
              <Link href="/admin/erase-user-data">{tEraseUserData('heading')}</Link>
              <Link href="/admin/claim">{tClaim('heading')}</Link>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
