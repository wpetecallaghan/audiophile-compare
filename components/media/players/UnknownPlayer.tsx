'use client'

import { useTranslations } from 'next-intl'

type Props = {
  url: string
}

export default function UnknownPlayer({ url }: Props) {
  const t = useTranslations('tests')

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-blue-600 underline break-all"
    >
      {t('openClipLink')}
    </a>
  )
}
