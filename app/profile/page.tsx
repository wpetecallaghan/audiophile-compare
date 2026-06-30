import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from '@/components/ProfileForm'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirectTo=/profile')

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, email')
    .eq('id', user.id)
    .single()

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold">Profile</h1>
        {profile?.email && (
          <p className="text-sm text-gray-400">{profile.email}</p>
        )}
      </div>
      <ProfileForm initialDisplayName={profile?.display_name ?? ''} />
    </main>
  )
}
