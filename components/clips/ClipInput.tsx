'use client'

import type { VerifiedClip } from '@/lib/types/test-creation'
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
  if (result.url_status === STATUS_DEAD) {
    return (
      <FormMessage tone="error">
        This URL could not be reached. Check the link and try again.
      </FormMessage>
    )
  }
  return (
    <FormMessage tone="success">
      Verified — {result.provider}
      {result.media_type !== 'unknown' && `, ${result.media_type}`}
      {result.url_status === STATUS_DEGRADED && ' (server responded slowly — may be intermittent)'}
    </FormMessage>
  )
}

// A single URL input with verify button
export function ClipInput({
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
        <TextInput
          type="url"
          value={url}
          onChange={e => { onUrlChange(e.target.value); }}
          placeholder={urlPlaceholder}
          className="flex-1"
        />
        <Button
          variant="secondary"
          onClick={onVerify}
          disabled={!url.trim() || verifying}
          className="shrink-0"
        >
          {verifying ? verifyingLabel : verifyLabel}
        </Button>
      </div>
      {verified && <VerificationBadge result={verified} />}
    </div>
  )
}
