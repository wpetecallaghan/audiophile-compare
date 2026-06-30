'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Props = {
  systemId: string
  initialName: string
  initialDescription: string | null
}

export default function EditSystemForm({ systemId, initialName, initialDescription }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/systems/${systemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Failed to update system')
        return
      }
      router.push(`/systems/${systemId}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="space-y-3">
        <input
          type="text"
          placeholder="System name"
          value={name}
          onChange={e => setName(e.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        <Link
          href={`/systems/${systemId}`}
          className="text-sm text-gray-500 hover:underline"
        >
          Cancel
        </Link>
      </div>
    </div>
  )
}
