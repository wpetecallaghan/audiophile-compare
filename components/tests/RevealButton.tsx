'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ConfirmButton } from '@/components/ui/ConfirmButton'

type Props = {
  testId: string
}

export default function RevealButton({ testId }: Props) {
  const t = useTranslations('tests.reveal')
  const tCommon = useTranslations('common')
  const router = useRouter()

  async function handleReveal() {
    const res = await fetch(`/api/tests/${testId}/reveal`, { method: 'POST' })
    const json = await res.json()

    if (!res.ok) {
      return { error: json.error ?? tCommon('somethingWentWrong') }
    }

    // Refresh the page — the server component will re-fetch with revealed status
    // router.refresh() tells Next.js to re-run server components for this page
    // without a full browser navigation
    router.refresh()
  }

  return (
    <ConfirmButton
      label={t('button')}
      confirmHeading={t('confirmHeading')}
      confirmWarning={t('confirmWarning')}
      confirmLabel={t('confirmButton')}
      pendingLabel={t('revealing')}
      cancelLabel={t('cancelButton')}
      onConfirm={handleReveal}
    />
  )
}
