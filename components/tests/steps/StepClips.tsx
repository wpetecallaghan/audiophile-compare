'use client'

import { useState } from 'react'
import type { VerifiedClip, TestDraft } from '@/lib/types/test-creation'
import { useTranslations } from 'next-intl'

type Props = {
  draft: TestDraft
  onComplete: (updates: Partial<TestDraft>) => void
}

// Status badge shown after verification
function VerificationBadge({ result }: { result: VerifiedClip }) {
  if (result.url_status === 'dead') {
    return (
      <p className="text-sm text-red-600">
        This URL could not be reached. Check the link and try again.
      </p>
    )
  }
  return (
    <p className="text-sm text-green-700">
      Verified — {result.provider}
      {result.media_type !== 'unknown' && `, ${result.media_type}`}
      {result.url_status === 'degraded' && ' (server responded slowly — may be intermittent)'}
    </p>
  )
}

// A single URL input with verify button
function ClipInput({
  label,
  url,
  verified,
  onUrlChange,
  onVerify,
  verifying,
  urlPlaceholder,
  verifyLabel,
  verifyingLabel,
}: {
  label: string
  url: string
  verified: VerifiedClip | null
  onUrlChange: (v: string) => void
  onVerify: () => void
  verifying: boolean
  urlPlaceholder: string
  verifyLabel: string
  verifyingLabel: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Clip {label}</p>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={e => { onUrlChange(e.target.value); }}
          placeholder={urlPlaceholder}
          className="flex-1 border dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded px-3 py-2 text-sm"
        />
        <button
          onClick={onVerify}
          disabled={!url.trim() || verifying}
          className="shrink-0 border dark:border-gray-600 rounded px-3 py-2 text-sm font-medium
            hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          {verifying ? verifyingLabel : verifyLabel}
        </button>
      </div>
      {verified && <VerificationBadge result={verified} />}
    </div>
  )
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
    verifiedA !== null && verifiedA.url_status !== 'dead' &&
    verifiedB !== null && verifiedB.url_status !== 'dead'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('heading')}</h2>
        <p className="text-sm text-gray-500 mt-1">
          Enter the URL for each recording. Listeners will see these as Clip A
          and Clip B — the before/after identity stays hidden until you reveal.
        </p>
      </div>

      <ClipInput
        label="A"
        url={urlA}
        verified={verifiedA}
        onUrlChange={v => { setUrlA(v); setVerifiedA(null) }}
        onVerify={() => verify(urlA, setVerifyingA, setVerifiedA)}
        verifying={verifyingA}
        urlPlaceholder={t('urlPlaceholder')}
        verifyLabel={t('verifyButton')}
        verifyingLabel={t('verifying')}
      />

      <ClipInput
        label="B"
        url={urlB}
        verified={verifiedB}
        onUrlChange={v => { setUrlB(v); setVerifiedB(null) }}
        onVerify={() => verify(urlB, setVerifyingB, setVerifiedB)}
        verifying={verifyingB}
        urlPlaceholder={t('urlPlaceholder')}
        verifyLabel={t('verifyButton')}
        verifyingLabel={t('verifying')}
      />

      <div className="rounded border p-4 space-y-2">
        <p className="text-sm font-medium">{t('beforeQuestion')}</p>
        <p className="text-sm text-gray-500">
          {t('beforeDescription')}
        </p>
        <div className="flex gap-4 mt-2">
          {(['A', 'B'] as const).map(side => (
            <label key={side} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="before"
                checked={side === 'A' ? beforeIsA : !beforeIsA}
                onChange={() => setBeforeIsA(side === 'A')}
              />
              Clip {side} is before
            </label>
          ))}
        </div>
      </div>

      <button
        disabled={!canContinue}
        onClick={() => onComplete({
          clipAUrl: urlA,
          clipAVerified: verifiedA,
          clipBUrl: urlB,
          clipBVerified: verifiedB,
          beforeIsA,
        })}
        className="w-full bg-black text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        {tw('continueButton')}
      </button>
    </div>
  )
}