'use client'

import { useState } from 'react'
import type { Snapshot, SystemWithSnapshots, TestDraft } from '@/lib/types/test-creation'
import { useTranslations } from 'next-intl'

type Props = {
  draft: TestDraft
  systems: SystemWithSnapshots[]
  onComplete: (updates: Partial<TestDraft>) => void
  onSnapshotCreated: (systemId: string, snap: Snapshot) => void
  onSystemCreated: (system: SystemWithSnapshots) => void
}

// Shows a system's snapshots as radio options with an inline "Add new snapshot"
// form at the bottom of each system group.
function SnapshotSelector({
  systems,
  selected,
  exclude,       // prevent the same snapshot being selected for both A and B
  label,
  onChange,
  onSnapshotCreated,
}: {
  systems: SystemWithSnapshots[]
  selected: Snapshot | null
  exclude: string | null
  label: string
  onChange: (s: Snapshot) => void
  onSnapshotCreated: (systemId: string, snap: Snapshot) => void
}) {
  const [addingForSystemId, setAddingForSystemId] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function startAdding(systemId: string) {
    setAddingForSystemId(systemId)
    setNewLabel('')
    setNewNotes('')
    setCreateError(null)
  }

  function cancelAdding() {
    setAddingForSystemId(null)
    setNewLabel('')
    setNewNotes('')
    setCreateError(null)
  }

  async function handleSubmit(systemId: string) {
    if (!newLabel.trim()) {
      setCreateError('Label is required')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch(`/api/systems/${systemId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel.trim(),
          notes: newNotes.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setCreateError((body as { error?: string }).error ?? 'Failed to create snapshot')
        return
      }
      const snap: Snapshot = (body as { snapshot: Snapshot }).snapshot
      // Notify CreateTestForm so it can merge the new snapshot into its local state
      onSnapshotCreated(systemId, snap)
      // Auto-select the new snapshot for this side
      onChange(snap)
      setAddingForSystemId(null)
      setNewLabel('')
      setNewNotes('')
    } catch {
      setCreateError('Network error — please try again')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {systems.map(system => (
        <div key={system.id} className="border dark:border-gray-700 rounded p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {system.name}
          </p>

          {/* Existing snapshot radio options */}
          {system.system_snapshots.map(snap => (
            <label
              key={snap.id}
              className={`flex items-start gap-3 cursor-pointer rounded p-2 text-sm
                ${snap.id === exclude ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
                ${selected?.id === snap.id ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700 rounded' : ''}
              `}
            >
              <input
                type="radio"
                name={`snapshot-${label}`}
                value={snap.id}
                disabled={snap.id === exclude}
                checked={selected?.id === snap.id}
                onChange={() => onChange(snap)}
                className="mt-0.5"
              />
              <div>
                <span className="font-medium">v{snap.version} — {snap.label}</span>
                {snap.notes && (
                  <p className="text-gray-500 mt-0.5">{snap.notes}</p>
                )}
              </div>
            </label>
          ))}

          {/* Inline mini-form or add button */}
          {addingForSystemId === system.id ? (
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800 mt-1">
              <p className="text-xs font-medium text-gray-500">New snapshot</p>
              <input
                type="text"
                placeholder="Label (e.g. After — Furutech cable)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                placeholder="Notes (optional)"
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                rows={2}
                className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {createError && (
                <p className="text-xs text-red-500">{createError}</p>
              )}
              <p className="text-xs text-gray-400">
                Components can be filled in on the Systems page after creation.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSubmit(system.id)}
                  disabled={creating || !newLabel.trim()}
                  className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
                >
                  {creating ? 'Adding…' : 'Add snapshot'}
                </button>
                <button
                  type="button"
                  onClick={cancelAdding}
                  disabled={creating}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => startAdding(system.id)}
              className="text-xs text-blue-600 hover:underline"
            >
              + Add new snapshot
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function StepSnapshots({ draft, systems, onComplete, onSnapshotCreated, onSystemCreated }: Props) {
  const t = useTranslations('tests.snapshotsStep')
  const tw = useTranslations('tests.wizard')
  const [snapshotA, setSnapshotA] = useState<Snapshot | null>(draft.snapshotA)
  const [snapshotB, setSnapshotB] = useState<Snapshot | null>(draft.snapshotB)

  // Inline system creation state
  const [addingSystem, setAddingSystem]               = useState(false)
  const [newSystemName, setNewSystemName]             = useState('')
  const [newSystemDesc, setNewSystemDesc]             = useState('')
  const [creatingSystem, setCreatingSystem]           = useState(false)
  const [systemCreateError, setSystemCreateError]     = useState<string | null>(null)

  const noSystems = systems.length === 0
  const isDisabled = snapshotA === null || snapshotB === null

  function startAddingSystem() {
    setAddingSystem(true)
    setNewSystemName('')
    setNewSystemDesc('')
    setSystemCreateError(null)
  }

  function cancelAddingSystem() {
    setAddingSystem(false)
    setNewSystemName('')
    setNewSystemDesc('')
    setSystemCreateError(null)
  }

  async function handleSystemSubmit() {
    if (!newSystemName.trim()) return
    setCreatingSystem(true)
    setSystemCreateError(null)
    try {
      const res = await fetch('/api/systems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSystemName.trim(),
          description: newSystemDesc.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setSystemCreateError((body as { error?: string }).error ?? 'Failed to create system')
        return
      }
      const { system } = body as { system: { id: string; name: string; description: string | null } }
      onSystemCreated({ ...system, system_snapshots: [] })
      setAddingSystem(false)
      setNewSystemName('')
      setNewSystemDesc('')
    } catch {
      setSystemCreateError('Network error — please try again')
    } finally {
      setCreatingSystem(false)
    }
  }

  const addSystemTrigger = addingSystem ? (
    <div className="space-y-2 rounded border border-gray-200 dark:border-gray-700 p-3">
      <p className="text-xs font-medium text-gray-500">New system</p>
      <input
        type="text"
        placeholder="System name"
        value={newSystemName}
        onChange={e => setNewSystemName(e.target.value)}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <textarea
        placeholder="Description (optional)"
        value={newSystemDesc}
        onChange={e => setNewSystemDesc(e.target.value)}
        rows={2}
        className="w-full rounded border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      {systemCreateError && (
        <p className="text-xs text-red-500">{systemCreateError}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSystemSubmit}
          disabled={creatingSystem || !newSystemName.trim()}
          className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {creatingSystem ? 'Adding…' : 'Add system'}
        </button>
        <button
          type="button"
          onClick={cancelAddingSystem}
          disabled={creatingSystem}
          className="text-xs text-gray-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={startAddingSystem}
      className="text-xs text-blue-600 hover:underline"
    >
      + Add new system
    </button>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Systems</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('description')}
        </p>
      </div>

      {noSystems ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            You have no systems yet. Add one below to continue.
          </p>
          {addSystemTrigger}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <SnapshotSelector
              systems={systems}
              selected={snapshotA}
              exclude={snapshotB?.id ?? null}
              label={t('snapshotALabel')}
              onChange={setSnapshotA}
              onSnapshotCreated={onSnapshotCreated}
            />
            <SnapshotSelector
              systems={systems}
              selected={snapshotB}
              exclude={snapshotA?.id ?? null}
              label={t('snapshotBLabel')}
              onChange={setSnapshotB}
              onSnapshotCreated={onSnapshotCreated}
            />
          </div>
          {addSystemTrigger}
        </div>
      )}

      <button
        disabled={isDisabled ? true : undefined}
        onClick={() => onComplete({ snapshotA, snapshotB })}
        className="w-full bg-black text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
        suppressHydrationWarning
      >
        {tw('continueButton')}
      </button>
    </div>
  )
}