'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  systemId: string
}

export default function AddSnapshotForm({ systemId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpen() {
    setOpen(true)
    setLabel('')
    setNotes('')
    setError(null)
  }

  function handleCancel() {
    setOpen(false)
    setLabel('')
    setNotes('')
    setError(null)
  }

  async function handleSubmit() {
    if (!label.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/systems/${systemId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          notes: notes.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Failed to create snapshot')
        return
      }
      setOpen(false)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="text-sm text-blue-600 hover:underline"
      >
        + Add new snapshot
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded border border-gray-200 p-4">
      <p className="text-sm font-medium">New snapshot</p>
      <input
        type="text"
        placeholder="Label (e.g. After — Furutech cable)"
        value={label}
        onChange={e => setLabel(e.target.value)}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        className="w-full rounded border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <textarea
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        className="w-full rounded border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !label.trim()}
          className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {submitting ? 'Adding…' : 'Add snapshot'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="text-xs text-gray-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
