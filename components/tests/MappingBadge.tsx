import { useTranslations } from 'next-intl'
import { Callout } from '@/components/ui/Callout'
import { formatOneSnapshot, type SnapshotSummary } from '@/lib/tests/format-snapshot-line'

type Props = {
  // Set to the clip's source_url when that clip can't be embedded
  // (see lib/clips/is-unsupported.ts) — turns this clip's slot into a
  // direct link instead of plain text. null for a clip with a working
  // embedded player, which doesn't need a redundant link.
  clipAUnsupportedUrl?: string | null
  clipBUnsupportedUrl?: string | null
  // Which system/snapshot each clip corresponds to (step 65) — clip A always
  // pairs with snapshot_a_id, clip B with snapshot_b_id, a documented
  // invariant across every test-creation path (see build-history/65). Safe
  // to render unconditionally here: this component only ever renders once
  // isRevealed is true, at which point canSeeSystemInfo (step 43) is already
  // true for every viewer, not just the creator.
  snapshotA?: SnapshotSummary
  snapshotB?: SnapshotSummary
}

// Shows which system/snapshot each blind clip label (A/B) really was, once
// revealed. This is a server component — no interactivity needed.
//
// No "Revealed" heading and no explicit Before/After wording (step 67) —
// the page's own status eyebrow already says "Revealed" once, and each
// clip's own snapshot text (below) already identifies it, so both were
// redundant. See build-history/67-mapping-badge-ia-tidy.md.
export default function MappingBadge({
  clipAUnsupportedUrl = null,
  clipBUnsupportedUrl = null,
  snapshotA = null,
  snapshotB = null,
}: Props) {
  const t = useTranslations('tests.mapping')
  const tTests = useTranslations('tests')

  const snapshotAText = formatOneSnapshot(snapshotA)
  const snapshotBText = formatOneSnapshot(snapshotB)

  return (
    <Callout tone="info">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="font-medium">{t('clipALabel')}</span>
          {clipAUnsupportedUrl && (
            <a
              href={clipAUnsupportedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-blue-700 dark:text-blue-300 underline"
            >
              {tTests('openClipLink')}
            </a>
          )}
          {snapshotAText && (
            <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-0.5">{snapshotAText}</p>
          )}
        </div>
        <div>
          <span className="font-medium">{t('clipBLabel')}</span>
          {clipBUnsupportedUrl && (
            <a
              href={clipBUnsupportedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-blue-700 dark:text-blue-300 underline"
            >
              {tTests('openClipLink')}
            </a>
          )}
          {snapshotBText && (
            <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-0.5">{snapshotBText}</p>
          )}
        </div>
      </div>
    </Callout>
  )
}
