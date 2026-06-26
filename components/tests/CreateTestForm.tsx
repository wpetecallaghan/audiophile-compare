'use client'

import { useState } from 'react'
import StepTrack     from './steps/StepTrack'
import StepSnapshots from './steps/StepSnapshots'
import StepClips     from './steps/StepClips'
import StepPublish   from './steps/StepPublish'
import type { TestDraft, SystemWithSnapshots } from '@/lib/types/test-creation'

type Props = {
  systems: SystemWithSnapshots[]
}

const STEPS = ['Track', 'Systems', 'Clips', 'Publish'] as const
type Step = 0 | 1 | 2 | 3

const initialDraft: TestDraft = {
  track:         null,
  snapshotA:     null,
  snapshotB:     null,
  clipAUrl:      '',
  clipAVerified: null,
  clipBUrl:      '',
  clipBVerified: null,
  beforeIsA:     true,
  title:         '',
}

export default function CreateTestForm({ systems }: Props) {
  const [step, setStep]   = useState<Step>(0)
  const [draft, setDraft] = useState<TestDraft>(initialDraft)

  function advance(updates: Partial<TestDraft>) {
    setDraft(prev => ({ ...prev, ...updates }))
    setStep(s => (s + 1) as Step)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className={`flex items-center gap-2 text-sm
              ${i === step ? 'font-semibold text-black' : 'text-gray-400'}`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs
                ${i < step  ? 'bg-black text-white' : ''}
                ${i === step ? 'ring-2 ring-black text-black' : ''}
                ${i > step  ? 'ring-1 ring-gray-300 text-gray-400' : ''}
              `}>
                {i < step ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-6 sm:w-12 mx-2
                ${i < step ? 'bg-black' : 'bg-gray-200'}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Active step */}
      {step === 0 && (
        <StepTrack draft={draft} onComplete={advance} />
      )}
      {step === 1 && (
        <StepSnapshots draft={draft} systems={systems} onComplete={advance} />
      )}
      {step === 2 && (
        <StepClips draft={draft} onComplete={advance} />
      )}
      {step === 3 && (
        <StepPublish draft={draft} onBack={() => setStep(2)} />
      )}

    </div>
  )
}