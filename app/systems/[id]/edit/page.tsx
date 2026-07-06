import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import EditSystemForm from '@/components/systems/EditSystemForm'
import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'

type Props = {
  params: Promise<{ id: string }>
}

export default async function EditSystemPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: system, error } = await supabase
    .from('systems')
    .select('id, name, description, owner_id')
    .eq('id', id)
    .single()

  if (error || !system) notFound()

  // Only the owner may edit — treat non-owner access as 404
  if (!user || user.id !== (system as unknown as { owner_id: string }).owner_id) {
    notFound()
  }

  const t = await getTranslations('systems')

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <nav className="text-xs text-gray-500 dark:text-gray-400">
        <Link href="/systems" className="hover:underline">{t('heading')}</Link>
        {' / '}
        <Link href={`/systems/${id}`} className="hover:underline">{system.name}</Link>
        {' / '}
        <span>{t('editBreadcrumb')}</span>
      </nav>
      <Heading level={1}>{t('editHeading')}</Heading>
      <EditSystemForm
        systemId={id}
        initialName={system.name}
        initialDescription={system.description ?? null}
      />
    </main>
  )
}
