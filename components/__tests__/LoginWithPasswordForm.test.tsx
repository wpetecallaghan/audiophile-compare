import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginWithPasswordForm from '../LoginWithPasswordForm'

// --- Mocks ---

const mockSignInWithPassword = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { signInWithPassword: mockSignInWithPassword },
  })),
}))

// --- Tests ---

describe('LoginWithPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders email and password inputs', () => {
      render(<LoginWithPasswordForm />)
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    })

    it('renders the Sign in button', () => {
      render(<LoginWithPasswordForm />)
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    it('shows no error initially', () => {
      render(<LoginWithPasswordForm />)
      expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('calls signInWithPassword with email and password', async () => {
      const user = userEvent.setup()
      mockSignInWithPassword.mockResolvedValue({ error: null })

      render(<LoginWithPasswordForm redirectTo="/systems" />)

      await user.type(screen.getByLabelText(/email address/i), 'test@example.com')
      await user.type(screen.getByLabelText(/^password/i), 'secret123')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => {
        expect(mockSignInWithPassword).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'secret123',
        })
      })
    })

    it('navigates to redirectTo on success', async () => {
      const user = userEvent.setup()
      mockSignInWithPassword.mockResolvedValue({ error: null })

      render(<LoginWithPasswordForm redirectTo="/systems" />)

      await user.type(screen.getByLabelText(/email address/i), 'a@b.com')
      await user.type(screen.getByLabelText(/^password/i), 'pass1234')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => expect(window.location.href).toBe('/systems'))
    })

    it('navigates to / when redirectTo is omitted', async () => {
      const user = userEvent.setup()
      mockSignInWithPassword.mockResolvedValue({ error: null })

      render(<LoginWithPasswordForm />)

      await user.type(screen.getByLabelText(/email address/i), 'a@b.com')
      await user.type(screen.getByLabelText(/^password/i), 'pass1234')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      await waitFor(() => expect(window.location.href).toBe('/'))
    })

    it('shows "Signing in…" while submitting', async () => {
      const user = userEvent.setup()
      mockSignInWithPassword.mockReturnValue(new Promise(() => {})) // never resolves

      render(<LoginWithPasswordForm />)
      await user.type(screen.getByLabelText(/email address/i), 'a@b.com')
      await user.type(screen.getByLabelText(/^password/i), 'pass1234')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByRole('button', { name: /signing in/i })).toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('Error handling', () => {
    it('shows invalid credentials error for generic auth failure', async () => {
      const user = userEvent.setup()
      mockSignInWithPassword.mockResolvedValue({
        error: { message: 'Invalid login credentials' },
      })

      render(<LoginWithPasswordForm />)
      await user.type(screen.getByLabelText(/email address/i), 'a@b.com')
      await user.type(screen.getByLabelText(/^password/i), 'wrong')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument()
    })

    it('shows email not confirmed error', async () => {
      const user = userEvent.setup()
      mockSignInWithPassword.mockResolvedValue({
        error: { message: 'Email not confirmed' },
      })

      render(<LoginWithPasswordForm />)
      await user.type(screen.getByLabelText(/email address/i), 'a@b.com')
      await user.type(screen.getByLabelText(/^password/i), 'pass1234')
      await user.click(screen.getByRole('button', { name: /sign in/i }))

      expect(await screen.findByText(/email not confirmed/i)).toBeInTheDocument()
    })
  })
})
