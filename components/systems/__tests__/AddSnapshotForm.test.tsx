import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddSnapshotForm from '../AddSnapshotForm'
import { HTTP_CREATED, HTTP_BAD_REQUEST, HTTP_INTERNAL_SERVER_ERROR } from '@/lib/api/http-status'

// --- Mocks ---

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

// --- Fixtures ---

const SYSTEM_ID = 'system-abc'
const NEW_SNAP = {
  id: 'snap-new', version: 3, label: 'After — Townshend',
  notes: null, components: null, created_at: '2024-01-03T00:00:00Z',
}

// --- Tests ---

describe('AddSnapshotForm', () => {
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
    it('shows the "+ Add new snapshot" button and no form initially', () => {
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)
      expect(
        screen.getByRole('button', { name: '+ Add new snapshot' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText(/label \(e\.g\./i),
      ).not.toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Open and close
  // ---------------------------------------------------------------------------

  describe('Open and close', () => {
    it('shows the inline form when the trigger button is clicked', async () => {
      const user = userEvent.setup()
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))

      expect(screen.getByPlaceholderText(/label \(e\.g\./i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/notes \(optional\)/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add snapshot' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })

    it('hides the form and restores the trigger button when Cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(
        screen.queryByPlaceholderText(/label \(e\.g\./i),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: '+ Add new snapshot' }),
      ).toBeInTheDocument()
    })

    it('clears form fields when the form is reopened after a cancel', async () => {
      const user = userEvent.setup()
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'Partial text')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))

      expect(screen.getByPlaceholderText(/label \(e\.g\./i)).toHaveValue('')
    })
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe('Validation', () => {
    it('disables "Add snapshot" when label is empty', async () => {
      const user = userEvent.setup()
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))

      expect(screen.getByRole('button', { name: 'Add snapshot' })).toBeDisabled()
    })

    it('enables "Add snapshot" once a non-empty label is typed', async () => {
      const user = userEvent.setup()
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'My label')

      expect(screen.getByRole('button', { name: 'Add snapshot' })).not.toBeDisabled()
    })

    it('treats a whitespace-only label as empty — button stays disabled', async () => {
      const user = userEvent.setup()
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), '   ')

      expect(screen.getByRole('button', { name: 'Add snapshot' })).toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('POSTs to the correct URL with trimmed label and notes', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: NEW_SNAP }), { status: HTTP_CREATED }),
      )
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), ' My label ')
      await user.type(screen.getByPlaceholderText(/notes \(optional\)/i), 'Some notes')
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/systems/${SYSTEM_ID}/snapshots`,
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'My label', notes: 'Some notes' }),
          }),
        )
      })
    })

    it('calls router.refresh() on success', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: NEW_SNAP }), { status: HTTP_CREATED }),
      )
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'My label')
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalledOnce()
      })
    })

    it('hides the form and restores the trigger button after success', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: NEW_SNAP }), { status: HTTP_CREATED }),
      )
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'My label')
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(
          screen.queryByPlaceholderText(/label \(e\.g\./i),
        ).not.toBeInTheDocument()
      })
      expect(
        screen.getByRole('button', { name: '+ Add new snapshot' }),
      ).toBeInTheDocument()
    })

    it('shows the server error message and keeps the form open on a failed API response', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Label is required' }),
          { status: HTTP_BAD_REQUEST },
        ),
      )
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'My label')
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(screen.getByText('Label is required')).toBeInTheDocument()
      })
      expect(screen.getByPlaceholderText(/label \(e\.g\./i)).toBeInTheDocument()
      expect(mockRefresh).not.toHaveBeenCalled()
    })

    it('shows a fallback error when the API response has no error field', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: HTTP_INTERNAL_SERVER_ERROR }),
      )
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'My label')
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to create snapshot')).toBeInTheDocument()
      })
    })

    it('shows "Network error" when fetch throws', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('network failure'))
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'My label')
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
      expect(mockRefresh).not.toHaveBeenCalled()
    })

    it('omits notes from the request body when notes field is empty', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ snapshot: NEW_SNAP }), { status: HTTP_CREATED }),
      )
      render(<AddSnapshotForm systemId={SYSTEM_ID} />)

      await user.click(screen.getByRole('button', { name: '+ Add new snapshot' }))
      await user.type(screen.getByPlaceholderText(/label \(e\.g\./i), 'My label')
      // leave notes empty
      await user.click(screen.getByRole('button', { name: 'Add snapshot' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/systems/${SYSTEM_ID}/snapshots`,
          expect.objectContaining({
            body: JSON.stringify({ label: 'My label' }),
          }),
        )
      })
    })
  })
})
