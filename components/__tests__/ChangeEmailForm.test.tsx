import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangeEmailForm from '../ChangeEmailForm'

// --- Mocks ---

const mockUpdateUser = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { updateUser: mockUpdateUser },
  })),
}))

// --- Tests ---

describe('ChangeEmailForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders the new email input', () => {
      render(<ChangeEmailForm />)
      expect(screen.getByLabelText(/new email address/i)).toBeInTheDocument()
    })

    it('renders the Send confirmation button', () => {
      render(<ChangeEmailForm />)
      expect(screen.getByRole('button', { name: /send confirmation/i })).toBeInTheDocument()
    })

    it('Send confirmation button is disabled when input is empty', () => {
      render(<ChangeEmailForm />)
      expect(screen.getByRole('button', { name: /send confirmation/i })).toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('calls updateUser with the new email', async () => {
      const user = userEvent.setup()
      mockUpdateUser.mockResolvedValue({ error: null })

      render(<ChangeEmailForm />)
      await user.type(screen.getByLabelText(/new email address/i), 'new@example.com')
      await user.click(screen.getByRole('button', { name: /send confirmation/i }))

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ email: 'new@example.com' })
      })
    })

    it('shows confirmation sent message on success', async () => {
      const user = userEvent.setup()
      mockUpdateUser.mockResolvedValue({ error: null })

      render(<ChangeEmailForm />)
      await user.type(screen.getByLabelText(/new email address/i), 'new@example.com')
      await user.click(screen.getByRole('button', { name: /send confirmation/i }))

      expect(await screen.findByText(/confirmation emails sent/i)).toBeInTheDocument()
    })

    it('shows "Sending…" while in flight', async () => {
      const user = userEvent.setup()
      mockUpdateUser.mockReturnValue(new Promise(() => {}))

      render(<ChangeEmailForm />)
      await user.type(screen.getByLabelText(/new email address/i), 'new@example.com')
      await user.click(screen.getByRole('button', { name: /send confirmation/i }))

      expect(await screen.findByRole('button', { name: /sending/i })).toBeDisabled()
    })

    it('shows error message on failure', async () => {
      const user = userEvent.setup()
      mockUpdateUser.mockResolvedValue({ error: { message: 'Email address already in use' } })

      render(<ChangeEmailForm />)
      await user.type(screen.getByLabelText(/new email address/i), 'taken@example.com')
      await user.click(screen.getByRole('button', { name: /send confirmation/i }))

      expect(await screen.findByText(/already in use/i)).toBeInTheDocument()
    })
  })
})
