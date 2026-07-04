'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

type ComponentDisplay = {
  role?: string
  make?: string
  model?: string
  notes?: string
}

type ComponentEdit = {
  role: string
  make: string
  model: string
  notes: string
}

type SnapshotData = {
  id: string
  version: number
  label: string
  notes: string | null
  components: ComponentDisplay[] | null
  created_at: string
}

type Props = {
  systemId: string
  snapshot: SnapshotData
  wins: number
  losses: number
  draws: number
  isOwner: boolean
  children: ReactNode
}

function emptyRow(): ComponentEdit {
  return { role: '', make: '', model: '', notes: '' }
}

function toEditRows(components: ComponentDisplay[] | null): ComponentEdit[] {
  if (!components || components.length === 0) return []
  return components.map(c => ({
    role: c.role ?? '',
    make: c.make ?? '',
    model: c.model ?? '',
    notes: c.notes ?? '',
  }))
}

export default function SnapshotSection({
  systemId,
  snapshot,
  wins,
  losses,
  draws,
  isOwner,
  children,
}: Props) {
  const router = useRouter()
  const t = useTranslations('snapshots')
  const hasRevealedTests = wins + losses + draws > 0

  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(snapshot.label)
  const [notes, setNotes] = useState(snapshot.notes ?? '')
  const [componentRows, setComponentRows] = useState<ComponentEdit[]>(
    toEditRows(snapshot.components),
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleEdit() {
    setLabel(snapshot.label)
    setNotes(snapshot.notes ?? '')
    setComponentRows(toEditRows(snapshot.components))
    setError(null)
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setError(null)
  }

  function addComponentRow() {
    setComponentRows(prev => [...prev, emptyRow()])
  }

  function removeComponentRow(index: number) {
    setComponentRows(prev => prev.filter((_, i) => i !== index))
  }

  function updateComponentRow(index: number, field: keyof ComponentEdit, value: string) {
    setComponentRows(prev =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    )
  }

  async function handleSave() {
    if (!label.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const cleanedComponents = componentRows
        .map(c => ({
          role: c.role.trim(),
          make: c.make.trim(),
          model: c.model.trim(),
          notes: c.notes.trim(),
        }))
        .filter(c => c.role || c.make || c.model || c.notes)

      const res = await fetch(
        `/api/systems/${systemId}/snapshots/${snapshot.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: label.trim(),
            notes: notes.trim() || null,
            components: cleanedComponents.length > 0 ? cleanedComponents : null,
          }),
        },
      )
      const body = await res.json()
      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Failed to save changes')
        return
      }
      setEditing(false)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-4">
      {editing ? (
        /* Edit mode */
        <div className="space-y-4 pb-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
              v{snapshot.version}
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Editing snapshot</p>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor={`snapshot-label-${snapshot.id}`}
                className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1"
              >
                Label
              </label>
              <input
                id={`snapshot-label-${snapshot.id}`}
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor={`snapshot-notes-${snapshot.id}`}
                className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1"
              >
                Notes
              </label>
              <textarea
                id={`snapshot-notes-${snapshot.id}`}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder={t('notesEditPlaceholder')}
                className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{t('componentsLabel')}</p>
              {componentRows.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center"
                >
                  <input
                    type="text"
                    placeholder={t('rolePlaceholder')}
                    value={row.role}
                    onChange={e => updateComponentRow(i, 'role', e.target.value)}
                    aria-label={t('componentRoleAriaLabel', { n: i + 1 })}
                    className="rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder={t('makePlaceholder')}
                    value={row.make}
                    onChange={e => updateComponentRow(i, 'make', e.target.value)}
                    aria-label={t('componentMakeAriaLabel', { n: i + 1 })}
                    className="rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder={t('modelPlaceholder')}
                    value={row.model}
                    onChange={e => updateComponentRow(i, 'model', e.target.value)}
                    aria-label={t('componentModelAriaLabel', { n: i + 1 })}
                    className="rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    placeholder={t('notesColumnPlaceholder')}
                    value={row.notes}
                    onChange={e => updateComponentRow(i, 'notes', e.target.value)}
                    aria-label={t('componentNotesAriaLabel', { n: i + 1 })}
                    className="rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeComponentRow(i)}
                    aria-label={t('removeComponentAriaLabel', { n: i + 1 })}
                    className="text-gray-500 dark:text-gray-400 hover:text-red-500 text-xs px-1"
                  >
                    ×
                  </button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="compact" onClick={addComponentRow}>
                {t('addComponentButton')}
              </Button>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="compact"
              onClick={handleSave}
              disabled={submitting || !label.trim()}
            >
              {submitting ? t('saving') : t('saveButton')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={handleCancel}
              disabled={submitting}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        /* Display mode */
        <div className="flex items-start justify-between gap-4 pb-2 border-b border-gray-100 dark:border-gray-800">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
                v{snapshot.version}
              </span>
              <h2 className="text-base sm:text-lg font-semibold">{snapshot.label}</h2>
              {isOwner && (
                <Button type="button" variant="secondary" size="compact" onClick={handleEdit}>
                  {t('editButton')}
                </Button>
              )}
            </div>
            {snapshot.notes && (
              <p className="text-xs text-gray-500 dark:text-gray-400">{snapshot.notes}</p>
            )}
            {/* suppressHydrationWarning: toLocaleDateString() can differ between
                Node.js (server SSR) and the browser; the mismatch is cosmetic. */}
            <p className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
              {new Date(snapshot.created_at).toLocaleDateString()}
            </p>
          </div>

          {hasRevealedTests && (
            <div className="shrink-0 flex gap-3 text-xs font-medium">
              {wins > 0 && <span className="text-green-700 dark:text-green-300">{wins}W</span>}
              {losses > 0 && <span className="text-red-700 dark:text-red-300">{losses}L</span>}
              {draws > 0 && <span className="text-gray-500 dark:text-gray-400">{draws}D</span>}
            </div>
          )}
        </div>
      )}

      {/* Component list — display mode only */}
      {!editing && snapshot.components && snapshot.components.length > 0 && (
        <ul className="space-y-0.5">
          {snapshot.components.map((c, i) => (
            <li key={i} className="text-xs text-gray-500 dark:text-gray-400">
              <span className="text-gray-500 dark:text-gray-400 w-20 inline-block">{c.role}</span>
              {c.make} {c.model}
              {c.notes && <span className="text-gray-500 dark:text-gray-400"> — {c.notes}</span>}
            </li>
          ))}
        </ul>
      )}

      {/* Tests list — server-rendered, always visible */}
      {children}
    </section>
  )
}
