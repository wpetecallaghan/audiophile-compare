import { createClient } from '@/lib/supabase/server'
import NextLink from 'next/link'
import { Link } from '@/components/ui/Link'
import { getTranslations } from 'next-intl/server'
import { buttonVariants } from '@/components/ui/Button'
import { Heading } from '@/components/ui/Heading'
import { PageShell } from '@/components/ui/PageShell'
import { RowCard } from '@/components/ui/RowCard'
import { Text } from '@/components/ui/Text'
import { getRequestLocale } from '@/lib/dates/get-request-locale'

export default async function SystemsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const t = await getTranslations('systems')
  const locale = await getRequestLocale()

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
    <PageShell maxWidth="4xl">
      <div className="flex items-center justify-between">
        <Heading level={1}>{t('heading')}</Heading>
        <div className="flex items-center gap-4">
          <Text as="span">
            {systems.length} {systems.length === 1 ? 'system' : 'systems'}
          </Text>
          <NextLink
            href="/systems/new"
            className={buttonVariants({ size: 'compact' })}
          >
            {t('newButton')}
          </NextLink>
        </div>
      </div>

      {systems.length === 0 ? (
        <Text>
          {t('empty')}{' '}
          <Link href="/tests/new">
            {t('createTestLink')}
          </Link>{' '}
          to add your first system.
        </Text>
      ) : (
        <ul className="space-y-3">
          {systems.map(system => {
            const snapshots = system.system_snapshots as SnapshotRow[]
            const latest = snapshots[0]
            return (
              <RowCard
                key={system.id}
                href={`/systems/${system.id}`}
                title={system.name}
                subtitle={
                  <>
                    {system.description && <Text size="xs">{system.description}</Text>}
                    <Text size="xs">
                      {snapshots.length}{' '}
                      {snapshots.length === 1 ? 'snapshot' : 'snapshots'}
                      {latest && ` · latest: v${latest.version} — ${latest.label}`}
                    </Text>
                  </>
                }
                trailing={<Text size="xs">{new Date(system.created_at).toLocaleDateString(locale)}</Text>}
              />
            )
          })}
        </ul>
      )}
    </PageShell>
  )
}
