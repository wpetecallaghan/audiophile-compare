import { useTranslations } from 'next-intl'

type Props = {
  clipAId: string
  beforeClipId: string
  afterClipId: string
}

// Shows which clip was before and which was after, once revealed.
// This is a server component — no interactivity needed.
export default function MappingBadge({ clipAId, beforeClipId, afterClipId }: Props) {
  const t = useTranslations('tests.mapping')
  const aIsBefore = clipAId === beforeClipId

  return (
    <div className="rounded border border-blue-200 bg-blue-50 p-4">
      <p className="text-sm font-semibold text-blue-900 mb-2">{t('revealedBadge')}</p>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-medium">{t('clipALabel')}</span>
          <span className="ml-2 text-blue-700">
            {aIsBefore ? t('before') : t('after')}
          </span>
        </div>
        <div>
          <span className="font-medium">{t('clipBLabel')}</span>
          <span className="ml-2 text-blue-700">
            {aIsBefore ? t('after') : t('before')}
          </span>
        </div>
      </div>
    </div>
  )
}