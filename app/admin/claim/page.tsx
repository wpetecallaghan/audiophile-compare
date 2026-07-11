import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { isAdminEmail } from '@/lib/admin/is-admin-email'
import { PageShell } from '@/components/ui/PageShell'
import { PageHeader } from '@/components/ui/PageHeader'
import ClaimPlaceholderForm from '@/components/admin/ClaimPlaceholderForm'

// build-history-ingestion.md step 39 — admin-only, human-verified claim
// flow (merges a placeholder account into a real, registered account).
// Same gate as app/admin/erase-user-data/page.tsx.
export default async function ClaimPlaceholderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Middleware handles unauthenticated users, but this is a safety net
  if (!user) redirect('/login?redirectTo=/admin/claim')

  // Authenticated but not on the allowlist — 404 rather than a message that
  // would confirm this route's existence and purpose
  if (!isAdminEmail(user.email)) notFound()

  const t = await getTranslations('admin.claim')

  return (
    <PageShell maxWidth="2xl">
      <PageHeader title={t('heading')} subtitle={t('description')} />

      <ClaimPlaceholderForm />
    </PageShell>
  )
}
