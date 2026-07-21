'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/components/ui/Link'

type Props = {
  url: string
}

export default function UnknownPlayer({ url }: Props) {
  const t = useTranslations('tests')

  return (
    <Link
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="underline break-all"
    >
      {t('openClipLink')}
    </Link>
  )
}
