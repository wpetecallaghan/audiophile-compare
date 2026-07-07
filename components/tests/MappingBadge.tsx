import { useTranslations } from 'next-intl'
import { Callout } from '@/components/ui/Callout'

type Props = {
  clipAId: string
  beforeClipId: string
  afterClipId: string
  // Set to the clip's source_url when that clip can't be embedded
  // (see lib/clips/is-unsupported.ts) — turns its Before/After label into
  // a direct link instead of plain text. null for a clip with a working
  // embedded player, which doesn't need a redundant link.
  clipAUnsupportedUrl?: string | null
  clipBUnsupportedUrl?: string | null
}

// Shows which clip was before and which was after, once revealed.
// This is a server component — no interactivity needed.
export default function MappingBadge({
  clipAId,
  beforeClipId,
  afterClipId,
  clipAUnsupportedUrl = null,
  clipBUnsupportedUrl = null,
}: Props) {
  const t = useTranslations('tests.mapping')
  const aIsBefore = clipAId === beforeClipId

  const clipALabelText = aIsBefore ? t('before') : t('after')
  const clipBLabelText = aIsBefore ? t('after') : t('before')

  return (
    <Callout tone="info">
      <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">{t('revealedBadge')}</p>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-medium">{t('clipALabel')}</span>
          <span className="ml-2 text-blue-700 dark:text-blue-300">
            {clipAUnsupportedUrl ? (
              <a href={clipAUnsupportedUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {clipALabelText}
              </a>
            ) : (
              clipALabelText
            )}
          </span>
        </div>
        <div>
          <span className="font-medium">{t('clipBLabel')}</span>
          <span className="ml-2 text-blue-700 dark:text-blue-300">
            {clipBUnsupportedUrl ? (
              <a href={clipBUnsupportedUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {clipBLabelText}
              </a>
            ) : (
              clipBLabelText
            )}
          </span>
        </div>
      </div>
    </Callout>
  )
}
