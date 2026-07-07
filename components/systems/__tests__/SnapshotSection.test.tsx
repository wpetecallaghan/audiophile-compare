import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SnapshotSection from '../SnapshotSection'

// --- Mocks ---

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

// --- Fixtures ---

const SYSTEM_ID = 'system-abc'
const SNAPSHOT_ID = 'snap-xyz'

const SNAPSHOT = {
  id: SNAPSHOT_ID,
  version: 2,
  label: 'After — Furutech cable',
  notes: 'Replaced interconnects',
  components: [
    { role: 'Amp', make: 'Linn', model: 'Akurate DS', notes: '' },
    { role: 'Speaker', make: 'Linn', model: 'Akubarik', notes: 'Aktiv' },
  ],
  created_at: '2024-01-15T00:00:00Z',
}

const SNAPSHOT_BARE = {
  id: SNAPSHOT_ID,
  version: 1,
  label: 'Stock',
  notes: null,
  components: null,
  created_at: '2024-01-01T00:00:00Z',
}

function renderSection(
  opts: {
    snapshot?: typeof SNAPSHOT | typeof SNAPSHOT_BARE
    wins?: number
    losses?: number
    draws?: number
    testCount?: number
    isOwner?: boolean
  } = {},
) {
  const {
    snapshot = SNAPSHOT_BARE,
    wins = 0,
    losses = 0,
    draws = 0,
    testCount = 0,
    isOwner = true,
  } = opts

  render(
    <SnapshotSection
      systemId={SYSTEM_ID}
      snapshot={snapshot}
      wins={wins}
      losses={losses}
      draws={draws}
      testCount={testCount}
      isOwner={isOwner}
    >
      <p>Test history</p>
    </SnapshotSection>,
  )
}

// --- Tests ---

describe('SnapshotSection', () => {
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
  // Rendering — display mode
  // ---------------------------------------------------------------------------

  describe('Rendering — display mode', () => {
    it('shows the version badge, label, notes, and renders children', () => {
      renderSection({ snapshot: SNAPSHOT })
      expect(screen.getByText('v2')).toBeInTheDocument()
      expect(screen.getByText('After — Furutech cable')).toBeInTheDocument()
      expect(screen.getByText('Replaced interconnects')).toBeInTheDocument()
      expect(screen.getByText('Test history')).toBeInTheDocument()
    })

    it('shows the component list when components are present', () => {
      renderSection({ snapshot: SNAPSHOT })
      expect(screen.getByText(/Akurate DS/)).toBeInTheDocument()
      expect(screen.getByText(/Akubarik/)).toBeInTheDocument()
    })

    it('does not show the component list when components is null', () => {
      renderSection({ snapshot: SNAPSHOT_BARE })
      expect(screen.queryByText(/Akurate DS/)).not.toBeInTheDocument()
    })

    it('shows win/loss/draw counts when present', () => {
      renderSection({ snapshot: SNAPSHOT_BARE, wins: 3, losses: 1, draws: 0 })
      expect(screen.getByText('3W')).toBeInTheDocument()
      expect(screen.getByText('1L')).toBeInTheDocument()
    })

    it('hides win/loss row when all are zero', () => {
      renderSection({ snapshot: SNAPSHOT_BARE, wins: 0, losses: 0, draws: 0 })
      expect(screen.queryByText(/W$/)).not.toBeInTheDocument()
      expect(screen.queryByText(/L$/)).not.toBeInTheDocument()
    })

    it('hides the Edit button when isOwner is false', () => {
      renderSection({ isOwner: false })
      expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    })

    it('shows the Edit button when isOwner is true', () => {
      renderSection({ isOwner: true })
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Edit mode — open and close
  // ---------------------------------------------------------------------------

  describe('Edit mode — open and close', () => {
    it('shows the edit form with pre-filled label and notes when Edit is clicked', async () => {
      const user = userEvent.setup()
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))

      expect(screen.getByRole('textbox', { name: /^label$/i })).toHaveValue(
        'After — Furutech cable',
      )
      expect(screen.getByRole('textbox', { name: /^notes$/i })).toHaveValue(
        'Replaced interconnects',
      )
    })

    it('pre-fills existing component rows', async () => {
      const user = userEvent.setup()
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))

      expect(screen.getByRole('textbox', { name: /component 1 role/i })).toHaveValue('Amp')
      expect(screen.getByRole('textbox', { name: /component 1 make/i })).toHaveValue('Linn')
      expect(screen.getByRole('textbox', { name: /component 2 model/i })).toHaveValue('Akubarik')
    })

    it('restores display mode and shows original label when Cancel is clicked', async () => {
      const user = userEvent.setup()
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.queryByRole('textbox', { name: /^label$/i })).not.toBeInTheDocument()
      expect(screen.getByText('After — Furutech cable')).toBeInTheDocument()
    })

    it('keeps the original label in display mode if edit is cancelled after typing', async () => {
      const user = userEvent.setup()
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      const labelInput = screen.getByRole('textbox', { name: /^label$/i })
      await user.clear(labelInput)
      await user.type(labelInput, 'Changed label')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      // Display mode always reads from props, not from cleared state
      expect(screen.getByText('After — Furutech cable')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Component row management
  // ---------------------------------------------------------------------------

  describe('Component row management', () => {
    it('"+ Add component" appends a new empty row', async () => {
      const user = userEvent.setup()
      renderSection({ snapshot: SNAPSHOT_BARE })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      expect(
        screen.queryByRole('textbox', { name: /component 1 role/i }),
      ).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /\+ add component/i }))

      expect(
        screen.getByRole('textbox', { name: /component 1 role/i }),
      ).toBeInTheDocument()
    })

    it('"Remove component" deletes that row and re-indexes remaining rows', async () => {
      const user = userEvent.setup()
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      expect(
        screen.getByRole('textbox', { name: /component 2 role/i }),
      ).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /remove component 1/i }))

      // Row 2 is now row 1; row 2 no longer exists
      expect(
        screen.queryByRole('textbox', { name: /component 2 role/i }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('textbox', { name: /component 1 role/i }),
      ).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe('Validation', () => {
    it('disables "Save changes" when label is cleared', async () => {
      const user = userEvent.setup()
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.clear(screen.getByRole('textbox', { name: /^label$/i }))

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    })

    it('treats whitespace-only label as empty', async () => {
      const user = userEvent.setup()
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      const labelInput = screen.getByRole('textbox', { name: /^label$/i })
      await user.clear(labelInput)
      await user.type(labelInput, '   ')

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('PATCHes to the correct URL', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: SNAPSHOT }), { status: 200 }),
      )
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/systems/${SYSTEM_ID}/snapshots/${SNAPSHOT_ID}`,
          expect.objectContaining({ method: 'PATCH' }),
        )
      })
    })

    it('sends null for notes when the notes field is cleared', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: SNAPSHOT }), { status: 200 }),
      )
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.clear(screen.getByRole('textbox', { name: /^notes$/i }))
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        const body = JSON.parse(
          (mockFetch.mock.calls[0][1] as RequestInit).body as string,
        )
        expect(body.notes).toBeNull()
      })
    })

    it('calls router.refresh() and closes edit mode on success', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: SNAPSHOT }), { status: 200 }),
      )
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalledOnce()
        expect(
          screen.queryByRole('textbox', { name: /^label$/i }),
        ).not.toBeInTheDocument()
      })
    })

    it('shows server error and keeps edit mode open on API failure', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'label must not be empty' }),
          { status: 400 },
        ),
      )
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(screen.getByText('label must not be empty')).toBeInTheDocument()
      })
      expect(screen.getByRole('textbox', { name: /^label$/i })).toBeInTheDocument()
      expect(mockRefresh).not.toHaveBeenCalled()
    })

    it('shows "Network error" when fetch throws', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('network failure'))
      renderSection({ snapshot: SNAPSHOT })

      await user.click(screen.getByRole('button', { name: /^edit$/i }))
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
      expect(mockRefresh).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  describe('Delete', () => {
    it('shows the Delete button when owner and no test references this snapshot', () => {
      renderSection({ isOwner: true, testCount: 0 })
      expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    })

    it('hides the Delete button when a test references this snapshot', () => {
      renderSection({ isOwner: true, testCount: 1 })
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it('hides the Delete button when isOwner is false', () => {
      renderSection({ isOwner: false, testCount: 0 })
      expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    })

    it('shows an inline confirm/cancel step before deleting', async () => {
      const user = userEvent.setup()
      renderSection({ testCount: 0 })

      await user.click(screen.getByRole('button', { name: /^delete$/i }))

      expect(screen.getByText('Delete this snapshot?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /yes, delete/i })).toBeInTheDocument()
    })

    it('DELETEs to the correct URL and refreshes on confirm', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      renderSection({ testCount: 0 })

      await user.click(screen.getByRole('button', { name: /^delete$/i }))
      await user.click(screen.getByRole('button', { name: /yes, delete/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/systems/${SYSTEM_ID}/snapshots/${SNAPSHOT_ID}`,
          expect.objectContaining({ method: 'DELETE' }),
        )
        expect(mockRefresh).toHaveBeenCalledOnce()
      })
    })

    it('shows a server error and stays on the confirm step when the delete fails', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'This snapshot is used by a test and can no longer be deleted' }),
          { status: 409 },
        ),
      )
      renderSection({ testCount: 0 })

      await user.click(screen.getByRole('button', { name: /^delete$/i }))
      await user.click(screen.getByRole('button', { name: /yes, delete/i }))

      await waitFor(() => {
        expect(
          screen.getByText('This snapshot is used by a test and can no longer be deleted'),
        ).toBeInTheDocument()
      })
      expect(mockRefresh).not.toHaveBeenCalled()
    })

    it('returns to the trigger button when Cancel is clicked', async () => {
      const user = userEvent.setup()
      renderSection({ testCount: 0 })

      await user.click(screen.getByRole('button', { name: /^delete$/i }))
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(screen.queryByText('Delete this snapshot?')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    })
  })
})
