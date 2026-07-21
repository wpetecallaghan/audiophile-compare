'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { VerifiedClip } from '@/lib/types/test-creation'
import { Button } from '@/components/ui/Button'
import { Callout } from '@/components/ui/Callout'
import { FormMessage } from '@/components/ui/FormMessage'
import { CONFIRM_TRIGGER_BUTTON_CLASSES } from '@/components/ui/ConfirmButton'
import { ClipInput } from '@/components/clips/ClipInput'
import { STATUS_DEAD } from '@/lib/clips/check-url'

type Props = {
  clipId: string
  label: 'A' | 'B'
}

// Creator-only remediation for a dead clip — reuses the same verify-then-
// persist flow as test creation (StepClips.tsx / ClipInput.tsx), scoped to
// a single existing clip via PATCH /api/clips/[id]. See build-history.md
// step 27.
export default function ReplaceClipUrlButton({ clipId, label }: Props) {
  const t = useTranslations('tests.replaceClip')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [open, setOpen]         = useState(false)
  const [url, setUrl]           = useState('')
  const [verified, setVerified] = useState<VerifiedClip | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function verify() {
    setVerifying(true)
    const res = await fetch('/api/clips/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const json = await res.json()
    setVerified(json)
    setVerifying(false)
  }

  async function handleSave() {
    if (!verified) return
    setSaving(true)
    setError(null)

    const res = await fetch(`/api/clips/${clipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_url: url,
        provider: verified.provider,
        media_type: verified.media_type,
        url_status: verified.url_status,
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? tCommon('somethingWentWrong'))
      setSaving(false)
      return
    }

    router.refresh()
  }

  if (open) {
    return (
      <Callout tone="neutral" className="space-y-3 w-full">
        <ClipInput
          label={label}
          url={url}
          verified={verified}
          onUrlChange={v => { setUrl(v); setVerified(null) }}
          onVerify={verify}
          verifying={verifying}
        />
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={!verified || verified.url_status === STATUS_DEAD || saving}
          >
            {saving ? t('saving') : t('saveButton')}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
            {t('cancelButton')}
          </Button>
        </div>
      </Callout>
    )
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className={CONFIRM_TRIGGER_BUTTON_CLASSES}
    >
      {t('button', { label })}
    </button>
  )
}
