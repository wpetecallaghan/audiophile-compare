import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreateSystemForm from '@/components/systems/CreateSystemForm'
import { getTranslations } from 'next-intl/server'

export default async function NewSystemPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirectTo=/systems/new')

  const t = await getTranslations('systems')

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
      <h1 className="text-xl sm:text-2xl font-semibold">{t('newHeading')}</h1>
      <CreateSystemForm />
    </main>
  )
}
