'use client'

import { useState } from 'react'
import type { VerifiedClip, TestDraft } from '@/lib/types/test-creation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { Heading } from '@/components/ui/Heading'
import { Text } from '@/components/ui/Text'
import { ClipInput } from '@/components/clips/ClipInput'
import { STATUS_DEAD } from '@/lib/clips/check-url'

type Props = {
  draft: TestDraft
  onComplete: (updates: Partial<TestDraft>) => void
}

export default function StepClips({ draft, onComplete }: Props) {
  const t = useTranslations('tests.clipsStep')
  const tw = useTranslations('tests.wizard')
  const [urlA, setUrlA]           = useState(draft.clipAUrl)
  const [urlB, setUrlB]           = useState(draft.clipBUrl)
  const [verifiedA, setVerifiedA] = useState<VerifiedClip | null>(draft.clipAVerified)
  const [verifiedB, setVerifiedB] = useState<VerifiedClip | null>(draft.clipBVerified)
  const [verifyingA, setVerifyingA] = useState(false)
  const [verifyingB, setVerifyingB] = useState(false)
  const [beforeIsA, setBeforeIsA] = useState(draft.beforeIsA)

  // The snapshot tied to Clip A (draft.snapshotA, chosen in the Systems
  // step) — StepSnapshots already gates its own Continue button on both
  // snapshots being non-null before advancing, so this is always
  // populated by the time this step renders; the fallback only satisfies
  // the `Snapshot | null` type.
  const firstSnapshotName = draft.snapshotA
    ? `v${draft.snapshotA.version} — ${draft.snapshotA.label}`
    : ''

  async function verify(url: string, setVerifying: (v: boolean) => void, setResult: (r: VerifiedClip) => void) {
    setVerifying(true)
    const res = await fetch('/api/clips/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const json = await res.json()
    setResult(json)
    setVerifying(false)
  }

  // Both clips must be verified and neither can be dead to proceed
  const canContinue =
    verifiedA !== null && verifiedA.url_status !== STATUS_DEAD &&
    verifiedB !== null && verifiedB.url_status !== STATUS_DEAD

  return (
    <div className="space-y-6">
      <div>
        <Heading level={2}>{t('heading')}</Heading>
        <Text className="mt-1">
          {t('description')}
        </Text>
      </div>

      <ClipInput
        label="A"
        url={urlA}
        verified={verifiedA}
        onUrlChange={v => { setUrlA(v); setVerifiedA(null) }}
        onVerify={() => verify(urlA, setVerifyingA, setVerifiedA)}
        verifying={verifyingA}
      />

      <ClipInput
        label="B"
        url={urlB}
        verified={verifiedB}
        onUrlChange={v => { setUrlB(v); setVerifiedB(null) }}
        onVerify={() => verify(urlB, setVerifyingB, setVerifiedB)}
        verifying={verifyingB}
      />

      <div className="rounded border p-4 space-y-2">
        <p className="text-sm font-medium">{t('beforeQuestion', { snapshot: firstSnapshotName })}</p>
        <Text>
          {t('beforeDescription')}
        </Text>
        <div className="flex gap-4 mt-2">
          {(['A', 'B'] as const).map(side => (
            <label key={side} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="before"
                checked={side === 'A' ? beforeIsA : !beforeIsA}
                onChange={() => setBeforeIsA(side === 'A')}
              />
              {t('beforeLabel', { side, snapshot: firstSnapshotName })}
            </label>
          ))}
        </div>
      </div>

      <Button
        disabled={!canContinue}
        onClick={() => onComplete({
          clipAUrl: urlA,
          clipAVerified: verifiedA,
          clipBUrl: urlB,
          clipBVerified: verifiedB,
          beforeIsA,
        })}
        className="w-full"
      >
        {tw('continueButton')}
      </Button>
    </div>
  )
}