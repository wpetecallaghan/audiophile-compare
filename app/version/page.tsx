import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { isAdminEmail } from '@/lib/admin/is-admin-email'

export default async function VersionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Middleware handles unauthenticated users, but this is a safety net
  if (!user) redirect('/login?redirectTo=/version')

  // Authenticated but not on the allowlist — 404 rather than a message that
  // would confirm this route's existence and purpose
  if (!isAdminEmail(user.email)) notFound()

  const t = await getTranslations('version')

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA
  const commitMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE
  const branch = process.env.VERCEL_GIT_COMMIT_REF
  const environment = process.env.VERCEL_ENV

  const rows: Array<{ label: string; value: string | undefined }> = [
    { label: t('commitLabel'), value: commitSha },
    { label: t('messageLabel'), value: commitMessage },
    { label: t('branchLabel'), value: branch },
    { label: t('environmentLabel'), value: environment },
  ]

  return (
    <main className="container mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
      <h1 className="text-xl sm:text-2xl font-semibold">{t('heading')}</h1>

      <dl className="space-y-3">
        {rows.map(({ label, value }) => (
          <div key={label} className="space-y-0.5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {label}
            </dt>
            <dd className="text-sm break-words whitespace-pre-wrap">
              {value || t('unavailable')}
            </dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
