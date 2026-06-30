import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function SystemsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const t = await getTranslations('systems')

  if (!user) return null // middleware handles the redirect

  type SnapshotRow = {
    id: string
    version: number
    label: string
    created_at: string
  }

  const { data } = await supabase
    .from('systems')
    .select(`
      id, name, description, created_at,
      system_snapshots(id, version, label, created_at)
    `)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .order('version', { referencedTable: 'system_snapshots', ascending: false })

  const systems = data ?? []

  return (
    <main className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-semibold">{t('heading')}</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {systems.length} {systems.length === 1 ? 'system' : 'systems'}
          </span>
          <Link
            href="/systems/new"
            className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
          >
            {t('newButton')}
          </Link>
        </div>
      </div>

      {systems.length === 0 ? (
        <p className="text-sm text-gray-400">
          {t('empty')}{' '}
          <Link href="/tests/new" className="text-blue-600 underline">
            {t('createTestLink')}
          </Link>{' '}
          to add your first system.
        </p>
      ) : (
        <ul className="space-y-3">
          {systems.map(system => {
            const snapshots = system.system_snapshots as SnapshotRow[]
            const latest = snapshots[0]
            return (
              <li key={system.id}>
                <Link
                  href={`/systems/${system.id}`}
                  className="block rounded border border-gray-200 px-3 sm:px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{system.name}</p>
                      {system.description && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {system.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {snapshots.length}{' '}
                        {snapshots.length === 1 ? 'snapshot' : 'snapshots'}
                        {latest && ` · latest: v${latest.version} — ${latest.label}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">
                      {new Date(system.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
