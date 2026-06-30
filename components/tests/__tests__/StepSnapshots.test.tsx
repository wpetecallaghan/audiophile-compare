import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StepSnapshots from '../steps/StepSnapshots'
import type { SystemWithSnapshots, Snapshot, TestDraft } from '@/lib/types/test-creation'

// --- Fixtures ---

const SYSTEM_ID = 'system-1'

const SNAP_1: Snapshot = {
  id: 'snap-1', version: 1, label: 'Before — stock cable',
  notes: null, components: null, created_at: '2024-01-01T00:00:00Z',
}
const SNAP_2: Snapshot = {
  id: 'snap-2', version: 2, label: 'After — Furutech',
  notes: null, components: null, created_at: '2024-01-02T00:00:00Z',
}
const NEW_SNAP: Snapshot = {
  id: 'snap-new', version: 3, label: 'After — Townshend',
  notes: null, components: null, created_at: '2024-01-03T00:00:00Z',
}
const NEW_SYSTEM: SystemWithSnapshots = {
  id: 'system-new', name: 'Bedroom rig', description: null,
  system_snapshots: [],
}

const SYSTEM: SystemWithSnapshots = {
  id: SYSTEM_ID, name: 'Main system', description: null,
  system_snapshots: [SNAP_1, SNAP_2],
}
const EMPTY_SYSTEM: SystemWithSnapshots = {
  id: 'system-2', name: 'New system', description: null,
  system_snapshots: [],
}

const BLANK_DRAFT: TestDraft = {
  track: null, snapshotA: null, snapshotB: null,
  clipAUrl: '', clipAVerified: null,
  clipBUrl: '', clipBVerified: null,
  beforeIsA: true, title: '',
}

function renderStep(
  systems: SystemWithSnapshots[],
  opts: {
    onComplete?: ReturnType<typeof vi.fn>
    onSnapshotCreated?: ReturnType<typeof vi.fn>
    onSystemCreated?: ReturnType<typeof vi.fn>
  } = {},
) {
  const mockOnComplete        = opts.onComplete        ?? vi.fn()
  const mockOnSnapshotCreated = opts.onSnapshotCreated ?? vi.fn()
  const mockOnSystemCreated   = opts.onSystemCreated   ?? vi.fn()
  render(
    <StepSnapshots
      draft={BLANK_DRAFT}
      systems={systems}
      onComplete={mockOnComplete as (updates: Partial<TestDraft>) => void}
      onSnapshotCreated={mockOnSnapshotCreated as (systemId: string, snap: Snapshot) => void}
      onSystemCreated={mockOnSystemCreated as (system: SystemWithSnapshots) => void}
    />,
  )
  return { mockOnComplete, mockOnSnapshotCreated, mockOnSystemCreated }
}

// --- Tests ---

describe('StepSnapshots', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders the system name and existing snapshot labels in both columns', () => {
      renderStep([SYSTEM])
      // Each SnapshotSelector column renders the system group — expect two occurrences
      expect(screen.getAllByText('Main system')).toHaveLength(2)
      expect(screen.getAllByText(/Before — stock cable/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/After — Furutech/i).length).toBeGreaterThan(0)
    })

    it('shows "+ Add new snapshot" for every system including those with no snapshots', () => {
      renderStep([SYSTEM, EMPTY_SYSTEM])
      // 2 systems × 2 columns = 4 add buttons
      expect(
        screen.getAllByRole('button', { name: '+ Add new snapshot' }),
      ).toHaveLength(4)
    })

    it('shows a "no systems" message with a "+ Add new system" button when the systems list is empty', () => {
      renderStep([])
      expect(screen.getByText(/you have no systems yet/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: '+ Add new system' }),
      ).toBeInTheDocument()
      // External link to /systems is gone — would lose wizard progress
      expect(screen.queryByRole('link', { name: /create a system/i })).not.toBeInTheDocument()
    })

    it('disables the Continue button when no snapshots are selected', () => {
      renderStep([SYSTEM])
      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Inline form — open and close
  // ---------------------------------------------------------------------------

  describe('Inline form — open and close', () => {
    it('shows the mini-form when "+ Add new snapshot" is clicked', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      // Index [0] targets the Column-A (Snapshot A) selector's add button
      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )

      expect(
        screen.getByPlaceholderText(/label \(e\.g\./i),
      ).toBeInTheDocument()
      expect(
        screen.getByPlaceholderText(/notes \(optional\)/i),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Add snapshot' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /cancel/i }),
      ).toBeInTheDocument()
    })

    it('hides the mini-form and restores the add link after clicking Cancel', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )
      expect(screen.getByPlaceholderText(/label \(e\.g\./i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(
        screen.queryByPlaceholderText(/label \(e\.g\./i),
      ).not.toBeInTheDocument()
      // Both column add buttons are restored (1 system × 2 columns)
      expect(
        screen.getAllByRole('button', { name: '+ Add new snapshot' }),
      ).toHaveLength(2)
    })

    it('clears form fields when the form is reopened after a cancel', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      // Open, type, cancel
      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'Partial label')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      // Reopen
      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )

      expect(screen.getByPlaceholderText(/label \(e\.g\./i)).toHaveValue('')
    })
  })

  // ---------------------------------------------------------------------------
  // Inline form — validation
  // ---------------------------------------------------------------------------

  describe('Inline form — validation', () => {
    it('disables "Add snapshot" when label is empty and enables it when filled', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )

      // Disabled on open (empty label)
      expect(screen.getByRole('button', { name: 'Add snapshot' })).toBeDisabled()

      // Enabled after typing
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'New label')
      expect(screen.getByRole('button', { name: 'Add snapshot' })).not.toBeDisabled()
    })

    it('treats a whitespace-only label as empty — button stays disabled', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), '   ')

      expect(screen.getByRole('button', { name: 'Add snapshot' })).toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Inline form — submission
  // ---------------------------------------------------------------------------

  describe('Inline form — submission', () => {
    it('calls onSnapshotCreated with the systemId and the returned snapshot on success', async () => {
      const user = userEvent.setup()
      const mockOnSnapshotCreated = vi.fn()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: NEW_SNAP }), { status: 201 }),
      )
      renderStep([SYSTEM], { onSnapshotCreated: mockOnSnapshotCreated })

      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), NEW_SNAP.label)
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(mockOnSnapshotCreated).toHaveBeenCalledWith(SYSTEM_ID, NEW_SNAP)
      })
    })

    it('POSTs to the correct URL with label and notes in the body', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: NEW_SNAP }), { status: 201 }),
      )
      renderStep([SYSTEM])

      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'New label')
      await user.type(screen.getByPlaceholderText(/notes \(optional\)/i), 'Some notes')
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/systems/${SYSTEM_ID}/snapshots`,
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'New label', notes: 'Some notes' }),
          }),
        )
      })
    })

    it('hides the mini-form and restores the add link after successful creation', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: NEW_SNAP }), { status: 201 }),
      )
      renderStep([SYSTEM])

      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), NEW_SNAP.label)
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText(/label \(e\.g\./i),
        ).not.toBeInTheDocument()
      })
      expect(
        screen.getAllByRole('button', { name: '+ Add new snapshot' }),
      ).toHaveLength(2)
    })

    it('shows the server error message and keeps the form open on a failed API response', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
      )
      renderStep([SYSTEM])

      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'New label')
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(screen.getByText('Not found')).toBeInTheDocument()
      })
      // Form stays open
      expect(screen.getByPlaceholderText(/label \(e\.g\./i)).toBeInTheDocument()
    })

    it('shows "Network error" when fetch throws', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('network failure'))
      renderStep([SYSTEM])

      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'New label')
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Selection behaviour
  // ---------------------------------------------------------------------------

  describe('Selection behaviour', () => {
    it('enables Continue after selecting existing snapshots for both sides', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      // DOM order: A-col SNAP_1 [0], A-col SNAP_2 [1], B-col SNAP_1 [2], B-col SNAP_2 [3]
      const allRadios = screen.getAllByRole('radio')

      await user.click(allRadios[0]) // Snapshot A ← SNAP_1
      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()

      await user.click(allRadios[3]) // Snapshot B ← SNAP_2
      expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled()
    })

    it('enables Continue after inline creation auto-selects one side with the other already chosen', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: NEW_SNAP }), { status: 201 }),
      )
      renderStep([SYSTEM])

      // Select Snapshot B first
      const allRadios = screen.getAllByRole('radio')
      await user.click(allRadios[3]) // Snapshot B ← SNAP_2
      expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()

      // Create a new snapshot inline on the A side — should auto-select it
      await user.click(
        screen.getAllByRole('button', { name: '+ Add new snapshot' })[0],
      )
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), NEW_SNAP.label)
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      // onChange(NEW_SNAP) sets snapshotA → both sides filled → Continue enabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue/i })).not.toBeDisabled()
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Inline system creation
  // ---------------------------------------------------------------------------

  describe('Inline system creation', () => {
    it('renders "+ Add new system" button below the grid when systems exist', () => {
      renderStep([SYSTEM])
      expect(
        screen.getByRole('button', { name: '+ Add new system' }),
      ).toBeInTheDocument()
    })

    it('renders "+ Add new system" button in the no-systems empty state', () => {
      renderStep([])
      expect(
        screen.getByRole('button', { name: '+ Add new system' }),
      ).toBeInTheDocument()
    })

    it('shows the inline form when "+ Add new system" is clicked', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))

      expect(screen.getByPlaceholderText('System name')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/description \(optional\)/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add system' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('hides the form and restores the trigger button when Cancel is clicked', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.queryByPlaceholderText('System name')).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: '+ Add new system' }),
      ).toBeInTheDocument()
    })

    it('clears fields when the form is reopened after a cancel', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))
      await user.type(screen.getByPlaceholderText('System name'), 'Partial name')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))

      expect(screen.getByPlaceholderText('System name')).toHaveValue('')
    })

    it('disables "Add system" when name is empty', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))

      expect(screen.getByRole('button', { name: 'Add system' })).toBeDisabled()
    })

    it('treats a whitespace-only name as empty — button stays disabled', async () => {
      const user = userEvent.setup()
      renderStep([SYSTEM])

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))
      await user.type(screen.getByPlaceholderText('System name'), '   ')

      expect(screen.getByRole('button', { name: 'Add system' })).toBeDisabled()
    })

    it('POSTs to /api/systems with trimmed name and description', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ system: { id: NEW_SYSTEM.id, name: NEW_SYSTEM.name, description: null } }),
          { status: 201 },
        ),
      )
      renderStep([SYSTEM])

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))
      await user.type(screen.getByPlaceholderText('System name'), ' Bedroom rig ')
      await user.type(screen.getByPlaceholderText(/description \(optional\)/i), 'Secondary')
      await user.click(screen.getByRole('button', { name: 'Add system' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/systems',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Bedroom rig', description: 'Secondary' }),
          }),
        )
      })
    })

    it('calls onSystemCreated with the new system including empty system_snapshots', async () => {
      const user = userEvent.setup()
      const mockOnSystemCreated = vi.fn()
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ system: { id: NEW_SYSTEM.id, name: NEW_SYSTEM.name, description: null } }),
          { status: 201 },
        ),
      )
      renderStep([SYSTEM], { onSystemCreated: mockOnSystemCreated })

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))
      await user.type(screen.getByPlaceholderText('System name'), NEW_SYSTEM.name)
      await user.click(screen.getByRole('button', { name: 'Add system' }))

      await waitFor(() => {
        expect(mockOnSystemCreated).toHaveBeenCalledWith({
          id: NEW_SYSTEM.id,
          name: NEW_SYSTEM.name,
          description: null,
          system_snapshots: [],
        })
      })
    })

    it('closes the form on success', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ system: { id: NEW_SYSTEM.id, name: NEW_SYSTEM.name, description: null } }),
          { status: 201 },
        ),
      )
      renderStep([SYSTEM])

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))
      await user.type(screen.getByPlaceholderText('System name'), NEW_SYSTEM.name)
      await user.click(screen.getByRole('button', { name: 'Add system' }))

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('System name')).not.toBeInTheDocument()
      })
      expect(
        screen.getByRole('button', { name: '+ Add new system' }),
      ).toBeInTheDocument()
    })

    it('shows the server error and keeps the form open on a failed API response', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'name is required' }), { status: 400 }),
      )
      renderStep([SYSTEM])

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))
      await user.type(screen.getByPlaceholderText('System name'), 'Any name')
      await user.click(screen.getByRole('button', { name: 'Add system' }))

      await waitFor(() => {
        expect(screen.getByText('name is required')).toBeInTheDocument()
      })
      expect(screen.getByPlaceholderText('System name')).toBeInTheDocument()
    })

    it('shows a network error and keeps the form open when fetch throws', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('network failure'))
      renderStep([SYSTEM])

      await user.click(screen.getByRole('button', { name: '+ Add new system' }))
      await user.type(screen.getByPlaceholderText('System name'), 'Any name')
      await user.click(screen.getByRole('button', { name: 'Add system' }))

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
      expect(screen.getByPlaceholderText('System name')).toBeInTheDocument()
    })
  })
})
