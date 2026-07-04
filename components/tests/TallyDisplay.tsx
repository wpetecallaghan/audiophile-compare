import type { TallyResult } from '@/lib/votes/compute-tally'
import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'
import { Callout } from '@/components/ui/Callout'

type Props = {
  tally: TallyResult
  clipAId: string
  clipBId: string
}

export default async function TallyDisplay({ tally, clipAId, clipBId }: Props) {
  const t = await getTranslations('tests.results')
  const { curated, others, divergent } = tally
  const votedTechniques = curated.filter(r => r.total > 0)
  const hasAnyVotes = votedTechniques.length > 0 || others.length > 0

  return (
    <div className="space-y-4">
      <Heading level={2}>{t('heading')}</Heading>

      {!hasAnyVotes && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('noVotes')}</p>
      )}

      {divergent && (
        <Callout tone="warning" className="px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          Techniques disagree on the winner — this change may involve a
          tradeoff.
        </Callout>
      )}

      {/* Curated technique percentage bars */}
      {votedTechniques.length > 0 && (
        <div className="space-y-5">
          {votedTechniques.map(r => (
            <div key={r.techniqueId} className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-medium">{r.techniqueName}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {r.total} {r.total === 1 ? 'vote' : 'votes'}
                </span>
              </div>

              {(
                [
                  {
                    clipId: clipAId,
                    label: 'Clip A',
                    votes: r.clipAVotes,
                    percent: r.clipAPercent,
                  },
                  {
                    clipId: clipBId,
                    label: 'Clip B',
                    votes: r.clipBVotes,
                    percent: r.clipBPercent,
                  },
                ] as const
              ).map(({ clipId, label, percent }) => (
                <div key={clipId} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-12 text-right shrink-0">
                    {label}
                  </span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        r.winnerClipId === clipId
                          ? 'bg-blue-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-7 text-right shrink-0">
                    {percent}%
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Other — qualitative list */}
      {others.length > 0 && (
        <div className="space-y-2 pt-1">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Other {others.length === 1 ? 'approach' : 'approaches'}
          </h3>
          <ul className="space-y-2">
            {others.map((vote, i) => (
              <li key={i} className="text-sm text-gray-600 dark:text-gray-300">
                <span className="font-medium">
                  {vote.chosenClipId === clipAId ? 'Clip A' : 'Clip B'}
                </span>
                {' — '}
                {vote.description}
                {vote.observation && (
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-2">
                    {vote.observation}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
