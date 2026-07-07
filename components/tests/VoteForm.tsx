'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Heading } from '@/components/ui/Heading'
import { FieldLabel } from '@/components/ui/FieldLabel'
import { TextInput, TextArea } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'

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
  hasDeadClip?: boolean
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
  hasDeadClip = false,
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

  if (hasDeadClip) {
    return (
      <Callout tone="warning" className="text-sm text-amber-800 dark:text-amber-200">
        {tr('blockedByDeadClip')}
      </Callout>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Heading level={2}>
          {isUpdate ? tr('updateHeading') : tr('castHeading')}
        </Heading>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Choose which clip you preferred for each technique. You can vote on
          any or all of them.
        </p>
      </div>

      {techniques.map(t => {
        const v = votes[t.id]
        return (
          <div
            key={t.id}
            className="rounded border border-gray-200 dark:border-gray-700 p-3 sm:p-4 space-y-3"
          >
            {/* Technique header + A/B radio */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t.description}</p>
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
                <FieldLabel tone="muted" htmlFor={`other-desc-${t.id}`}>
                  Describe your criterion{' '}
                  <span className="text-red-600 dark:text-red-400">*</span>
                </FieldLabel>
                <TextInput
                  id={`other-desc-${t.id}`}
                  type="text"
                  size="compact"
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
                <FieldLabel tone="muted" htmlFor={`observation-${t.id}`}>
                  Observation{' '}
                  <span className="text-gray-500 dark:text-gray-400">(optional)</span>
                </FieldLabel>
                <TextArea
                  id={`observation-${t.id}`}
                  rows={2}
                  size="compact"
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

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <Button
        type="submit"
        disabled={submitting || !hasAnyVote}
        className="w-full"
      >
        {submitting
          ? tr('submitting')
          : isUpdate
          ? tr('updateButton')
          : tr('saveButton')}
      </Button>
    </form>
  )
}
