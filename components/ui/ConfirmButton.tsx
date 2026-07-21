'use client'

import { useState } from 'react'
import { Button } from './Button'
import { Callout } from './Callout'
import { FormMessage } from './FormMessage'

// Two-step confirm/cancel action button (click → inline confirm/cancel).
// Introduced in step 26 by extracting RevealButton.tsx's original pattern
// once a second and third caller (test/snapshot/system delete) needed the
// exact same interaction — see components.md §12 and build-history.md
// step 26.

// The idle-trigger button below is also reused verbatim by
// ReplaceClipUrlButton.tsx (a different, simpler amber "needs attention"
// action that doesn't use ConfirmButton's own confirm/cancel state
// machine) — exported so both stay in sync instead of hand-copying the
// class string a second time (build step 83).
export const CONFIRM_TRIGGER_BUTTON_CLASSES =
  'border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 rounded px-4 py-2 text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/20'

type Props = {
  label: string
  confirmHeading: string
  confirmWarning: string
  confirmLabel: string
  pendingLabel: string
  cancelLabel: string
  // Return `{ error }` to show an inline error and stay in the confirming
  // state; return void/undefined when the caller already navigated away
  // or refreshed (e.g. after a delete or reveal).
  onConfirm: () => Promise<{ error?: string } | void>
}

export function ConfirmButton({
  label,
  confirmHeading,
  confirmWarning,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  onConfirm,
}: Props) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    const result = await onConfirm()

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
    // Otherwise the caller already navigated away or refreshed the page.
  }

  if (confirming) {
    return (
      <Callout tone="warning" className="space-y-3">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          {confirmHeading}
        </p>
        <p className="text-sm">
          {confirmWarning}
        </p>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {loading ? pendingLabel : confirmLabel}
          </button>
          <Button variant="secondary" onClick={() => setConfirming(false)} disabled={loading}>
            {cancelLabel}
          </Button>
        </div>
      </Callout>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={CONFIRM_TRIGGER_BUTTON_CLASSES}
    >
      {label}
    </button>
  )
}
