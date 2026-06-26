'use client'

import { useState } from 'react'
import type { Snapshot, SystemWithSnapshots, TestDraft } from '@/lib/types/test-creation'

type Props = {
  draft: TestDraft
  systems: SystemWithSnapshots[]
  onComplete: (updates: Partial<TestDraft>) => void
}

// A small selector that shows a system's snapshots as radio options
function SnapshotSelector({
  systems,
  selected,
  exclude,       // prevent the same snapshot being selected for both A and B
  label,
  onChange,
}: {
  systems: SystemWithSnapshots[]
  selected: Snapshot | null
  exclude: string | null
  label: string
  onChange: (s: Snapshot) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {systems.map(system => (
        system.system_snapshots.length === 0 ? null : (
          <div key={system.id} className="border rounded p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {system.name}
            </p>
            {system.system_snapshots.map(snap => (
              <label
                key={snap.id}
                className={`flex items-start gap-3 cursor-pointer rounded p-2 text-sm
                  ${snap.id === exclude ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-50'}
                  ${selected?.id === snap.id ? 'bg-blue-50 ring-1 ring-blue-300 rounded' : ''}
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
          </div>
        )
      ))}
    </div>
  )
}

export default function StepSnapshots({ draft, systems, onComplete }: Props) {
  const [snapshotA, setSnapshotA] = useState<Snapshot | null>(draft.snapshotA)
  const [snapshotB, setSnapshotB] = useState<Snapshot | null>(draft.snapshotB)

  const noSnapshots = systems.every(s => s.system_snapshots.length === 0)
  const isDisabled = snapshotA === null || snapshotB === null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Systems</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choose the two system snapshots being compared. They must be different.
        </p>
      </div>

      {noSnapshots ? (
        <p className="text-sm text-gray-500">
          You have no system snapshots yet. Add a system and create a snapshot
          before setting up a test.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <SnapshotSelector
            systems={systems}
            selected={snapshotA}
            exclude={snapshotB?.id ?? null}
            label="Snapshot A"
            onChange={setSnapshotA}
          />
          <SnapshotSelector
            systems={systems}
            selected={snapshotB}
            exclude={snapshotA?.id ?? null}
            label="Snapshot B"
            onChange={setSnapshotB}
          />
        </div>
      )}

      <button
        disabled={isDisabled ? true : undefined}
        onClick={() => onComplete({ snapshotA, snapshotB })}
        className="w-full bg-black text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-40"
        suppressHydrationWarning
      >
        Continue
      </button>
    </div>
  )
}