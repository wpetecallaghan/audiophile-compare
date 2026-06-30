import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ForgotPasswordForm from '../ForgotPasswordForm'

// --- Mocks ---

const mockResetPasswordForEmail = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { resetPasswordForEmail: mockResetPasswordForEmail },
  })),
}))

Object.defineProperty(window, 'location', {
  value: { origin: 'http://localhost:3000' },
  writable: true,
})

// --- Tests ---

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders the heading and email input', () => {
      render(<ForgotPasswordForm />)
      expect(screen.getByText(/reset your password/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    })

    it('renders the Send reset link button', () => {
      render(<ForgotPasswordForm />)
      expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
    })

    it('renders the Back to sign in button when onBack is provided', () => {
      const onBack = vi.fn()
      render(<ForgotPasswordForm onBack={onBack} />)
      expect(screen.getByRole('button', { name: /back to sign in/i })).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('calls resetPasswordForEmail with correct arguments', async () => {
      const user = userEvent.setup()
      mockResetPasswordForEmail.mockResolvedValue({ error: null })

      render(<ForgotPasswordForm />)
      await user.type(screen.getByLabelText(/email address/i), 'pete@example.com')
      await user.click(screen.getByRole('button', { name: /send reset link/i }))

      await waitFor(() => {
        expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
          'pete@example.com',
          expect.objectContaining({
            redirectTo: expect.stringContaining('/auth/callback?type=recovery'),
          }),
        )
      })
    })

    it('shows success message after sending', async () => {
      const user = userEvent.setup()
      mockResetPasswordForEmail.mockResolvedValue({ error: null })

      render(<ForgotPasswordForm />)
      await user.type(screen.getByLabelText(/email address/i), 'pete@example.com')
      await user.click(screen.getByRole('button', { name: /send reset link/i }))

      expect(await screen.findByText(/check your inbox for a password reset link/i)).toBeInTheDocument()
    })

    it('shows "Sending…" while in flight', async () => {
      const user = userEvent.setup()
      mockResetPasswordForEmail.mockReturnValue(new Promise(() => {}))

      render(<ForgotPasswordForm />)
      await user.type(screen.getByLabelText(/email address/i), 'pete@example.com')
      await user.click(screen.getByRole('button', { name: /send reset link/i }))

      expect(await screen.findByRole('button', { name: /sending/i })).toBeDisabled()
    })

    it('shows error message on failure', async () => {
      const user = userEvent.setup()
      mockResetPasswordForEmail.mockResolvedValue({
        error: { message: 'For security purposes, you can only request this once every 60 seconds' },
      })

      render(<ForgotPasswordForm />)
      await user.type(screen.getByLabelText(/email address/i), 'pete@example.com')
      await user.click(screen.getByRole('button', { name: /send reset link/i }))

      expect(await screen.findByText(/60 seconds/i)).toBeInTheDocument()
    })

    it('calls onBack when Back to sign in is clicked', async () => {
      const user = userEvent.setup()
      const onBack = vi.fn()

      render(<ForgotPasswordForm onBack={onBack} />)
      await user.click(screen.getByRole('button', { name: /back to sign in/i }))

      expect(onBack).toHaveBeenCalled()
    })
  })
})
