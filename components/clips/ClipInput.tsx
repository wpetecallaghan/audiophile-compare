'use client'

import type { VerifiedClip } from '@/lib/types/test-creation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/TextField'
import { FormMessage } from '@/components/ui/FormMessage'
import { STATUS_DEAD, STATUS_DEGRADED } from '@/lib/clips/check-url'

// Extracted in step 27 from StepClips.tsx once the "replace a dead clip's
// URL" flow needed the exact same URL input + Verify button + inline
// verified/dead message as test creation — see components.md and
// build-history.md step 27.

// Status message shown after verification
function VerificationBadge({ result }: { result: VerifiedClip }) {
  const t = useTranslations('tests.clipsStep')
  if (result.url_status === STATUS_DEAD) {
    return (
      <FormMessage tone="error">
        {t('deadUrlError')}
      </FormMessage>
    )
  }
  return (
    <FormMessage tone="success">
      {t('verified', { provider: result.provider })}
      {result.media_type !== 'unknown' && t('verifiedMediaType', { mediaType: result.media_type })}
      {result.url_status === STATUS_DEGRADED && t('verifiedDegraded')}
    </FormMessage>
  )
}

// A single URL input with verify button. Every string it shows comes from
// the tests.clipsStep namespace — both callers (StepClips.tsx,
// ReplaceClipUrlButton.tsx) already sourced the same keys there via props,
// so this looks them up directly instead of taking them redundantly from
// two call sites that would only ever pass the same values.
export function ClipInput({
  label,
  url,
  verified,
  onUrlChange,
  onVerify,
  verifying,
}: {
  label: string
  url: string
  verified: VerifiedClip | null
  onUrlChange: (v: string) => void
  onVerify: () => void
  verifying: boolean
}) {
  const t = useTranslations('tests.clipsStep')
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('clipLabel', { label })}</p>
      <div className="flex gap-2">
        <TextInput
          type="url"
          value={url}
          onChange={e => { onUrlChange(e.target.value); }}
          placeholder={t('urlPlaceholder')}
          className="flex-1"
        />
        <Button
          variant="secondary"
          onClick={onVerify}
          disabled={!url.trim() || verifying}
          className="shrink-0"
        >
          {verifying ? t('verifying') : t('verifyButton')}
        </Button>
      </div>
      {verified && <VerificationBadge result={verified} />}
    </div>
  )
}
