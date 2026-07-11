'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ConfirmButton } from '@/components/ui/ConfirmButton'

type Props = {
  systemId: string
}

export default function DeleteSystemButton({ systemId }: Props) {
  const t = useTranslations('systems.delete')
  const tCommon = useTranslations('common')
  const router = useRouter()

  async function handleDelete() {
    const res = await fetch(`/api/systems/${systemId}`, { method: 'DELETE' })
    const json = await res.json()

    if (!res.ok) {
      return { error: json.error ?? tCommon('somethingWentWrong') }
    }

    // The system no longer exists — leave its page rather than refresh it
    router.push('/systems')
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
