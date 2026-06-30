import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RegisterForm from '../RegisterForm'

// --- Mocks ---

const mockSignUp = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { signUp: mockSignUp },
  })),
}))

// jsdom does not define window.location.origin
Object.defineProperty(window, 'location', {
  value: { origin: 'http://localhost:3000' },
  writable: true,
})

// --- Tests ---

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders name, email, password, and confirm password inputs', () => {
      render(<RegisterForm />)
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    })

    it('renders the Create account button', () => {
      render(<RegisterForm />)
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe('Validation', () => {
    it('shows error when password is too short', async () => {
      const user = userEvent.setup()
      render(<RegisterForm />)

      await user.type(screen.getByLabelText(/full name/i), 'Pete')
      await user.type(screen.getByLabelText(/email address/i), 'a@b.com')
      await user.type(screen.getByLabelText(/^password/i), 'short')
      await user.type(screen.getByLabelText(/confirm password/i), 'short')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
      expect(mockSignUp).not.toHaveBeenCalled()
    })

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup()
      render(<RegisterForm />)

      await user.type(screen.getByLabelText(/full name/i), 'Pete')
      await user.type(screen.getByLabelText(/email address/i), 'a@b.com')
      await user.type(screen.getByLabelText(/^password/i), 'password1')
      await user.type(screen.getByLabelText(/confirm password/i), 'password2')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      expect(screen.getByText(/don.t match/i)).toBeInTheDocument()
      expect(mockSignUp).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('calls signUp with email, password and full_name in user metadata', async () => {
      const user = userEvent.setup()
      mockSignUp.mockResolvedValue({ error: null })

      render(<RegisterForm />)

      await user.type(screen.getByLabelText(/full name/i), 'Pete C')
      await user.type(screen.getByLabelText(/email address/i), 'pete@example.com')
      await user.type(screen.getByLabelText(/^password/i), 'password123')
      await user.type(screen.getByLabelText(/confirm password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(mockSignUp).toHaveBeenCalledWith({
          email: 'pete@example.com',
          password: 'password123',
          options: expect.objectContaining({
            data: { full_name: 'Pete C' },
          }),
        })
      })
    })

    it('shows success message after registration', async () => {
      const user = userEvent.setup()
      mockSignUp.mockResolvedValue({ error: null })

      render(<RegisterForm />)

      await user.type(screen.getByLabelText(/full name/i), 'Pete')
      await user.type(screen.getByLabelText(/email address/i), 'pete@example.com')
      await user.type(screen.getByLabelText(/^password/i), 'password123')
      await user.type(screen.getByLabelText(/confirm password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument()
    })

    it('shows "already registered" error for duplicate email', async () => {
      const user = userEvent.setup()
      mockSignUp.mockResolvedValue({
        error: { message: 'User already registered' },
      })

      render(<RegisterForm />)

      await user.type(screen.getByLabelText(/full name/i), 'Pete')
      await user.type(screen.getByLabelText(/email address/i), 'pete@example.com')
      await user.type(screen.getByLabelText(/^password/i), 'password123')
      await user.type(screen.getByLabelText(/confirm password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      expect(await screen.findByText(/already registered/i)).toBeInTheDocument()
    })

    it('shows "Creating account…" while submitting', async () => {
      const user = userEvent.setup()
      mockSignUp.mockReturnValue(new Promise(() => {}))

      render(<RegisterForm />)

      await user.type(screen.getByLabelText(/full name/i), 'Pete')
      await user.type(screen.getByLabelText(/email address/i), 'pete@example.com')
      await user.type(screen.getByLabelText(/^password/i), 'password123')
      await user.type(screen.getByLabelText(/confirm password/i), 'password123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      expect(await screen.findByRole('button', { name: /creating account/i })).toBeDisabled()
    })
  })
})
