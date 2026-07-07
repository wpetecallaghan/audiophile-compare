'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ConfirmButton } from '@/components/ui/ConfirmButton'

type Props = {
  testId: string
}

export default function DeleteTestButton({ testId }: Props) {
  const t = useTranslations('tests.delete')
  const router = useRouter()

  async function handleDelete() {
    const res = await fetch(`/api/tests/${testId}`, { method: 'DELETE' })
    const json = await res.json()

    if (!res.ok) {
      return { error: json.error ?? 'Something went wrong' }
    }

    // The test no longer exists — leave its page rather than refresh it
    router.push('/')
  }

  return (
    <ConfirmButton
      label={t('button')}
      confirmHeading={t('confirmHeading')}
      confirmWarning={t('confirmWarning')}
      confirmLabel={t('confirmButton')}
      pendingLabel={t('deleting')}
      cancelLabel={t('cancelButton')}
      onConfirm={handleDelete}
    />
  )
}
