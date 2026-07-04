import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreateTestForm from '@/components/tests/CreateTestForm'
import type { SystemWithSnapshots } from '@/lib/types/test-creation'
import { getTranslations } from 'next-intl/server'

export default async function NewTestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Middleware handles unauthenticated users, but this is a safety net
  if (!user) redirect('/login?redirectTo=/tests/new')

  const t = await getTranslations('tests')

  // Pre-fetch systems with snapshots server-side so the form has
  // data immediately — no loading state on step 2
  const { data: systems } = await supabase
    .from('systems')
    .select(`
      id, name, description,
      system_snapshots (
        id, version, label, notes, components, created_at
      )
    `)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .order('version', { referencedTable: 'system_snapshots', ascending: false })

  return (
    <main className="container mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
      <h1 className="text-xl sm:text-2xl font-semibold">
        {t('newHeading')}
      </h1>
      <CreateTestForm systems={(systems ?? []) as SystemWithSnapshots[]} />
    </main>
  )
}