import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { isAdminEmail } from '@/lib/admin/is-admin-email'
import { PageShell } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import EraseUserDataForm from '@/components/admin/EraseUserDataForm'

// build-history-ingestion.md step 38 — admin-only, human-verified data
// erasure. Same gate as app/version/page.tsx.
export default async function EraseUserDataPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Middleware handles unauthenticated users, but this is a safety net
  if (!user) redirect('/login?redirectTo=/admin/erase-user-data')

  // Authenticated but not on the allowlist — 404 rather than a message that
  // would confirm this route's existence and purpose
  if (!isAdminEmail(user.email)) notFound()

  const t = await getTranslations('admin.eraseUserData')

  return (
    <PageShell maxWidth="2xl">
      <PageHeader title={t('heading')} subtitle={t('description')} />

      <EraseUserDataForm />
    </PageShell>
  )
}
