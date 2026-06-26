import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreateTestForm from '@/components/tests/CreateTestForm'
import type { SystemWithSnapshots } from '@/lib/types/test-creation'

export default async function NewTestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Middleware handles unauthenticated users, but this is a safety net
  if (!user) redirect('/login?redirectTo=/tests/new')

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
    <main className="min-h-screen px-4 py-12">
      <h1 className="text-2xl font-semibold mb-8 max-w-2xl mx-auto">
        New test
      </h1>
      <CreateTestForm systems={(systems ?? []) as SystemWithSnapshots[]} />
    </main>
  )
}