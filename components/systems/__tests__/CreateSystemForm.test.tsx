import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreateSystemForm from '../CreateSystemForm'

// --- Mocks ---

const mockPush = vi.fn()
const mockBack = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}))

// --- Fixtures ---

const NEW_SYSTEM = { id: 'system-new', name: 'My rig', description: null }

// --- Tests ---

describe('CreateSystemForm', () => {
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
    it('renders name input, description textarea, and action buttons', () => {
      render(<CreateSystemForm />)
      expect(screen.getByPlaceholderText(/system name/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create system' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe('Validation', () => {
    it('disables "Create system" when name is empty', () => {
      render(<CreateSystemForm />)
      expect(screen.getByRole('button', { name: 'Create system' })).toBeDisabled()
    })

    it('enables "Create system" once a non-empty name is typed', async () => {
      const user = userEvent.setup()
      render(<CreateSystemForm />)

      await user.type(screen.getByPlaceholderText(/system name/i), 'My rig')

      expect(screen.getByRole('button', { name: 'Create system' })).not.toBeDisabled()
    })

    it('treats a whitespace-only name as empty — button stays disabled', async () => {
      const user = userEvent.setup()
      render(<CreateSystemForm />)

      await user.type(screen.getByPlaceholderText(/system name/i), '   ')

      expect(screen.getByRole('button', { name: 'Create system' })).toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('POSTs to /api/systems with trimmed name and description', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ system: NEW_SYSTEM }), { status: 201 }),
      )
      render(<CreateSystemForm />)

      await user.type(screen.getByPlaceholderText(/system name/i), ' My rig ')
      await user.type(screen.getByPlaceholderText(/description/i), 'Main listening room')
      await user.click(screen.getByRole('button', { name: 'Create system' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/systems',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'My rig', description: 'Main listening room' }),
          }),
        )
      })
    })

    it('redirects to the new system detail page on success', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ system: NEW_SYSTEM }), { status: 201 }),
      )
      render(<CreateSystemForm />)

      await user.type(screen.getByPlaceholderText(/system name/i), 'My rig')
      await user.click(screen.getByRole('button', { name: 'Create system' }))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/systems/${NEW_SYSTEM.id}`)
      })
    })

    it('shows server error message and keeps the form open on API failure', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'name is required' }), { status: 400 }),
      )
      render(<CreateSystemForm />)

      await user.type(screen.getByPlaceholderText(/system name/i), 'My rig')
      await user.click(screen.getByRole('button', { name: 'Create system' }))

      await waitFor(() => {
        expect(screen.getByText('name is required')).toBeInTheDocument()
      })
      expect(screen.getByPlaceholderText(/system name/i)).toBeInTheDocument()
    })

    it('shows a fallback error message when the API response has no error field', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 500 }),
      )
      render(<CreateSystemForm />)

      await user.type(screen.getByPlaceholderText(/system name/i), 'My rig')
      await user.click(screen.getByRole('button', { name: 'Create system' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to create system')).toBeInTheDocument()
      })
    })

    it('shows a network error message when fetch throws', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('Failed to fetch'))
      render(<CreateSystemForm />)

      await user.type(screen.getByPlaceholderText(/system name/i), 'My rig')
      await user.click(screen.getByRole('button', { name: 'Create system' }))

      await waitFor(() => {
        expect(screen.getByText('Network error — please try again')).toBeInTheDocument()
      })
    })

    it('shows "Creating…" while the request is in flight', async () => {
      const user = userEvent.setup()
      let resolve: (v: Response) => void
      mockFetch.mockReturnValue(
        new Promise<Response>(r => { resolve = r }),
      )
      render(<CreateSystemForm />)

      await user.type(screen.getByPlaceholderText(/system name/i), 'My rig')
      await user.click(screen.getByRole('button', { name: 'Create system' }))

      expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()

      // Clean up
      resolve!(new Response(JSON.stringify({ system: NEW_SYSTEM }), { status: 201 }))
    })
  })

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  describe('Cancel', () => {
    it('calls router.back() when Cancel is clicked', async () => {
      const user = userEvent.setup()
      render(<CreateSystemForm />)

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(mockBack).toHaveBeenCalledOnce()
    })
  })
})
