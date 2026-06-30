import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from '@/components/ProfileForm'
import ChangeEmailForm from '@/components/ChangeEmailForm'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import { getTranslations } from 'next-intl/server'

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

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, email')
    .eq('id', user.id)
    .single()

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold">{t('heading')}</h1>
        {profile?.email && (
          <p className="text-sm text-gray-400">{profile.email}</p>
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
    </main>
  )
}
