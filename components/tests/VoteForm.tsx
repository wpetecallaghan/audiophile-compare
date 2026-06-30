'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export type Technique = {
  id: string
  name: string
  description: string
  is_other: boolean
}

export type ExistingVote = {
  technique_id: string
  chosen_clip_id: string
  other_description: string | null
  observation: string | null
}

type Props = {
  testId: string
  clipAId: string
  clipBId: string
  techniques: Technique[]
  existingVotes: ExistingVote[]
}

type TechVote = {
  chosen: string | null // clipAId | clipBId | null
  observation: string
  otherDescription: string
}

export default function VoteForm({
  testId,
  clipAId,
  clipBId,
  techniques,
  existingVotes,
}: Props) {
  const router = useRouter()
  const tr = useTranslations('tests.vote')

  const initialState: Record<string, TechVote> = {}
  for (const t of techniques) {
    const existing = existingVotes.find(v => v.technique_id === t.id)
    initialState[t.id] = {
      chosen: existing?.chosen_clip_id ?? null,
      observation: existing?.observation ?? '',
      otherDescription: existing?.other_description ?? '',
    }
  }

  const [votes, setVotes] = useState(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setVoteField(
    techniqueId: string,
    field: keyof TechVote,
    value: string | null,
  ) {
    setVotes(prev => ({
      ...prev,
      [techniqueId]: { ...prev[techniqueId], [field]: value },
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const voteArray = []
    for (const t of techniques) {
      const v = votes[t.id]
      if (!v.chosen) continue
      if (t.is_other && !v.otherDescription.trim()) {
        setError(`Please describe your criterion for the "${t.name}" technique.`)
        return
      }
      voteArray.push({
        technique_id: t.id,
        chosen_clip_id: v.chosen,
        other_description: t.is_other ? v.otherDescription.trim() : undefined,
        observation: v.observation.trim() || undefined,
      })
    }

    if (voteArray.length === 0) {
      setError(tr('atLeastOneError'))
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: testId, votes: voteArray }),
      })

      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Failed to submit votes.')
        return
      }

      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const isUpdate = existingVotes.length > 0
  const hasAnyVote = techniques.some(t => votes[t.id].chosen !== null)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h2 className="text-base sm:text-lg font-semibold">
          {isUpdate ? tr('updateHeading') : tr('castHeading')}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose which clip you preferred for each technique. You can vote on
          any or all of them.
        </p>
      </div>

      {techniques.map(t => {
        const v = votes[t.id]
        return (
          <div
            key={t.id}
            className="rounded border border-gray-200 p-3 sm:p-4 space-y-3"
          >
            {/* Technique header + A/B radio */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-gray-400">{t.description}</p>
              </div>
              <div className="flex gap-4 shrink-0">
                {(['A', 'B'] as const).map(label => {
                  const clipId = label === 'A' ? clipAId : clipBId
                  return (
                    <label
                      key={label}
                      className="flex items-center gap-1.5 cursor-pointer text-sm"
                    >
                      <input
                        type="radio"
                        name={`technique-${t.id}`}
                        value={clipId}
                        checked={v.chosen === clipId}
                        onChange={() => setVoteField(t.id, 'chosen', clipId)}
                      />
                      Clip {label}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Other: required description */}
            {t.is_other && v.chosen && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Describe your criterion{' '}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="e.g. Low-level detail retrieval"
                  value={v.otherDescription}
                  onChange={e =>
                    setVoteField(t.id, 'otherDescription', e.target.value)
                  }
                />
              </div>
            )}

            {/* Optional observation — shown once a clip is chosen */}
            {v.chosen && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Observation{' '}
                  <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  placeholder={tr('observationPlaceholder')}
                  value={v.observation}
                  onChange={e =>
                    setVoteField(t.id, 'observation', e.target.value)
                  }
                />
              </div>
            )}
          </div>
        )
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !hasAnyVote}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting
          ? tr('submitting')
          : isUpdate
          ? tr('updateButton')
          : tr('saveButton')}
      </button>
    </form>
  )
}
