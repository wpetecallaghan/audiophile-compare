'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { buttonVariants } from '@/components/ui/Button'
import { Text } from '@/components/ui/Text'
import { STATUS_OK, STATUS_DEAD, type UrlStatus } from '@/lib/clips/check-url'
import { cn } from '@/components/ui/cn'

type Props = {
  clipId: string
  label: 'A' | 'B'
  urlStatus: UrlStatus
  adminOverride: UrlStatus | null
}

// Admin-only correction of a clip's health status (step 64) — for when
// the URL health-check cron gets it wrong: a false positive (some host's
// bot-mitigation, step 50's class of bug) or a false negative (a
// YouTube/Vimeo embed the cron can never detect as dead, step 27's
// documented blind spot). Any admin, not just the test's own creator, via
// PATCH /api/admin/clips/[id]/override. Shows the raw cron status
// alongside any active override so an admin can tell a warning is
// currently masked/forced rather than reflecting the cron's own check.
export default function AdminClipOverrideControl({ clipId, label, urlStatus, adminOverride }: Props) {
  const t = useTranslations('tests.adminOverride')
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  async function setOverride(override: UrlStatus | null) {
    setSaving(true)
    await fetch(`/api/admin/clips/${clipId}/override`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ override }),
    })
    router.refresh()
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Text size="xs">
        {t('cronStatus', { label, status: urlStatus })}
        {' · '}
        {adminOverride ? t('overrideActive', { status: adminOverride }) : t('noOverride')}
      </Text>
      <div className="flex flex-wrap gap-2">
        {adminOverride !== STATUS_DEAD && (
          <button
            onClick={() => setOverride(STATUS_DEAD)}
            disabled={saving}
            className={cn(buttonVariants({ variant: 'secondary', size: 'compact' }))}
          >
            {saving ? t('saving') : t('markBroken')}
          </button>
        )}
        {adminOverride !== STATUS_OK && (
          <button
            onClick={() => setOverride(STATUS_OK)}
            disabled={saving}
            className={cn(buttonVariants({ variant: 'secondary', size: 'compact' }))}
          >
            {saving ? t('saving') : t('markOk')}
          </button>
        )}
        {adminOverride !== null && (
          <button
            onClick={() => setOverride(null)}
            disabled={saving}
            className={cn(buttonVariants({ variant: 'secondary', size: 'compact' }))}
          >
            {saving ? t('saving') : t('clear')}
          </button>
        )}
      </div>
    </div>
  )
}
