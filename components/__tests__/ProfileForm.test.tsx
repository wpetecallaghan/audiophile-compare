import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileForm from '../ProfileForm'
import { HTTP_OK, HTTP_INTERNAL_SERVER_ERROR } from '@/lib/api/http-status'

// --- Mocks ---

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

// --- Tests ---

describe('ProfileForm', () => {
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
    it('pre-populates the display name input from props', () => {
      render(<ProfileForm initialDisplayName="Pete" />)
      expect(screen.getByLabelText(/display name/i)).toHaveValue('Pete')
    })

    it('renders an empty input when initialDisplayName is an empty string', () => {
      render(<ProfileForm initialDisplayName="" />)
      expect(screen.getByLabelText(/display name/i)).toHaveValue('')
    })

    it('renders Save and Cancel controls', () => {
      render(<ProfileForm initialDisplayName="Pete" />)
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /cancel/i })).toBeInTheDocument()
    })

    it('Cancel link points to /', () => {
      render(<ProfileForm initialDisplayName="Pete" />)
      expect(screen.getByRole('link', { name: /cancel/i })).toHaveAttribute('href', '/')
    })
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe('Validation', () => {
    it('disables Save when display name is cleared', async () => {
      const user = userEvent.setup()
      render(<ProfileForm initialDisplayName="Pete" />)

      await user.clear(screen.getByLabelText(/display name/i))

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('enables Save when display name is non-empty', () => {
      render(<ProfileForm initialDisplayName="Pete" />)
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('PATCHes to /api/profile with trimmed display_name', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ user: { display_name: 'Pete' } }), { status: HTTP_OK }),
      )
      render(<ProfileForm initialDisplayName=" Pete " />)

      await user.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/profile',
          expect.objectContaining({
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: 'Pete' }),
          }),
        )
      })
    })

    it('shows "Display name updated." on success', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ user: { display_name: 'Pete' } }), { status: HTTP_OK }),
      )
      render(<ProfileForm initialDisplayName="Pete" />)

      await user.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(screen.getByText('Display name updated.')).toBeInTheDocument()
      })
    })

    it('clears the success message when the input is changed after a save', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ user: { display_name: 'Pete' } }), { status: HTTP_OK }),
      )
      render(<ProfileForm initialDisplayName="Pete" />)

      await user.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => {
        expect(screen.getByText('Display name updated.')).toBeInTheDocument()
      })

      await user.type(screen.getByLabelText(/display name/i), 'X')

      expect(screen.queryByText('Display name updated.')).not.toBeInTheDocument()
    })

    it('shows server error and keeps the form open on API failure', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Failed to update profile' }), { status: HTTP_INTERNAL_SERVER_ERROR }),
      )
      render(<ProfileForm initialDisplayName="Pete" />)

      await user.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to update profile')).toBeInTheDocument()
      })
      expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
    })

    it('shows a fallback error when the API response has no error field', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({}), { status: HTTP_INTERNAL_SERVER_ERROR }),
      )
      render(<ProfileForm initialDisplayName="Pete" />)

      await user.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to update profile')).toBeInTheDocument()
      })
    })

    it('shows a network error when fetch throws', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('network'))
      render(<ProfileForm initialDisplayName="Pete" />)

      await user.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(screen.getByText('Network error — please try again')).toBeInTheDocument()
      })
    })

    it('shows "Saving…" and disables the button while in flight', async () => {
      const user = userEvent.setup()
      let resolve: (v: Response) => void
      mockFetch.mockReturnValue(new Promise<Response>(r => { resolve = r }))
      render(<ProfileForm initialDisplayName="Pete" />)

      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(screen.getByRole('button', { name: 'Saving\u2026' })).toBeDisabled()

      // Clean up
      resolve!(new Response(JSON.stringify({ user: { display_name: 'Pete' } }), { status: HTTP_OK }))
    })
  })
})
