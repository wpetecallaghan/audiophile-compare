import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditSystemForm from '../EditSystemForm'

// --- Mocks ---

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

// --- Fixtures ---

const SYSTEM_ID = 'system-abc'
const INITIAL_NAME = 'Living room rig'
const INITIAL_DESCRIPTION = 'Main listening system'
const UPDATED_SYSTEM = { id: SYSTEM_ID, name: 'Bedroom rig', description: null }

// --- Tests ---

describe('EditSystemForm', () => {
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
    it('pre-populates the name and description fields from props', () => {
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={INITIAL_DESCRIPTION}
        />,
      )
      expect(screen.getByPlaceholderText(/system name/i)).toHaveValue(INITIAL_NAME)
      expect(screen.getByPlaceholderText(/description/i)).toHaveValue(INITIAL_DESCRIPTION)
    })

    it('renders an empty description field when initialDescription is null', () => {
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )
      expect(screen.getByPlaceholderText(/description/i)).toHaveValue('')
    })

    it('renders Save changes and Cancel controls', () => {
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /cancel/i })).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe('Validation', () => {
    it('disables "Save changes" when name is cleared', async () => {
      const user = userEvent.setup()
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )

      await user.clear(screen.getByPlaceholderText(/system name/i))

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    })

    it('enables "Save changes" when name is non-empty', () => {
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )
      expect(screen.getByRole('button', { name: 'Save changes' })).not.toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('PATCHes to /api/systems/[id] with trimmed name and description', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ system: UPDATED_SYSTEM }), { status: 200 }),
      )
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={INITIAL_DESCRIPTION}
        />,
      )

      await user.clear(screen.getByPlaceholderText(/system name/i))
      await user.type(screen.getByPlaceholderText(/system name/i), ' Bedroom rig ')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `/api/systems/${SYSTEM_ID}`,
          expect.objectContaining({
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Bedroom rig', description: INITIAL_DESCRIPTION }),
          }),
        )
      })
    })

    it('redirects to the system detail page on success', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ system: UPDATED_SYSTEM }), { status: 200 }),
      )
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/systems/${SYSTEM_ID}`)
      })
    })

    it('shows server error message and keeps the form open on API failure', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
      )
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(screen.getByText('Not found')).toBeInTheDocument()
      })
      expect(screen.getByPlaceholderText(/system name/i)).toBeInTheDocument()
    })

    it('shows a fallback error message when the API response has no error field', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: 500 }),
      )
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to update system')).toBeInTheDocument()
      })
    })

    it('shows a network error message when fetch throws', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('Failed to fetch'))
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(screen.getByText('Network error — please try again')).toBeInTheDocument()
      })
    })

    it('shows "Saving…" while the request is in flight', async () => {
      const user = userEvent.setup()
      let resolve: (v: Response) => void
      mockFetch.mockReturnValue(
        new Promise<Response>(r => { resolve = r }),
      )
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )

      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()

      // Clean up
      resolve!(new Response(JSON.stringify({ system: UPDATED_SYSTEM }), { status: 200 }))
    })
  })

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  describe('Cancel', () => {
    it('Cancel link points to the system detail page', () => {
      render(
        <EditSystemForm
          systemId={SYSTEM_ID}
          initialName={INITIAL_NAME}
          initialDescription={null}
        />,
      )
      const cancelLink = screen.getByRole('link', { name: /cancel/i })
      expect(cancelLink).toHaveAttribute('href', `/systems/${SYSTEM_ID}`)
    })
  })
})
