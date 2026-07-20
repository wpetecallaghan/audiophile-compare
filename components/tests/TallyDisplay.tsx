import type { TallyResult } from '@/lib/votes/compute-tally'
import { getTranslations } from 'next-intl/server'
import { Heading } from '@/components/ui/Heading'
import { Callout } from '@/components/ui/Callout'

type Props = {
  tally: TallyResult
  clipAId: string
  clipBId: string
  // True when this tally reflects only the viewer's own vote — RLS
  // ("votes: read own or revealed") only returns every voter's row once
  // the test is revealed; before that, a voter sees just their own choice
  // reflected back, by design, not the full group's.
  ownVoteOnly: boolean
}

export default async function TallyDisplay({ tally, clipAId, clipBId, ownVoteOnly }: Props) {
  const t = await getTranslations('tests.results')
  const tMapping = await getTranslations('tests.mapping')
  const tTests = await getTranslations('tests')
  const { curated, others, divergent } = tally
  const votedTechniques = curated.filter(r => r.total > 0)
  const hasAnyVotes = votedTechniques.length > 0 || others.length > 0

  return (
    <div className="space-y-4">
      <Heading level={2}>{t('heading')}</Heading>

      {ownVoteOnly && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('ownVoteOnlyNote')}</p>
      )}

      {!hasAnyVotes && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('noVotes')}</p>
      )}

      {divergent && (
        <Callout tone="warning" className="px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          {t('divergentWarning')}
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
                    label: tMapping('clipALabel'),
                    votes: r.clipAVotes,
                    percent: r.clipAPercent,
                  },
                  {
                    clipId: clipBId,
                    label: tMapping('clipBLabel'),
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

              {r.observations.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {r.observations.map((obs, i) => (
                    <li key={i} className="text-sm text-gray-600 dark:text-gray-300">
                      <span className="font-medium">
                        {obs.chosenClipId === clipAId ? tMapping('clipALabel') : tMapping('clipBLabel')}
                      </span>
                      {' — '}
                      {obs.observation}
                      {' '}
                      {t('observationAuthor', { name: obs.voterName ?? tTests('anonymous') })}
                    </li>
                  ))}
                </ul>
              )}
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
                  {vote.chosenClipId === clipAId ? tMapping('clipALabel') : tMapping('clipBLabel')}
                </span>
                {' — '}
                {vote.description}
                {vote.observation && (
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 ml-2">
                    {vote.observation}
                    {' '}
                    {t('observationAuthor', { name: vote.voterName ?? tTests('anonymous') })}
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
