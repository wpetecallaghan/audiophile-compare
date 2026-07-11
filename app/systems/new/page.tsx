import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreateSystemForm from '@/components/systems/CreateSystemForm'
import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'
import { PageShell } from '@/components/ui/PageShell'

export default async function NewSystemPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?redirectTo=/systems/new')

  const t = await getTranslations('systems')

  return (
    <PageShell maxWidth="4xl">
      <Heading level={1}>{t('newHeading')}</Heading>
      <CreateSystemForm />
    </PageShell>
  )
}
