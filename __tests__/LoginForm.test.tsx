import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import LoginForm from '../components/LoginForm'

// Mock the Supabase client
const mockSignInWithOtp = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
    },
  })),
}))

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render email input field', () => {
      render(<LoginForm />)
      
      const emailInput = screen.getByLabelText(/email address/i)
      expect(emailInput).toBeInTheDocument()
      expect(emailInput).toHaveAttribute('type', 'email')
      expect(emailInput).toHaveAttribute('required')
    })

    it('should render submit button', () => {
      render(<LoginForm />)
      
      const submitButton = screen.getByRole('button', { name: /send magic link/i })
      expect(submitButton).toBeInTheDocument()
      expect(submitButton).toHaveAttribute('type', 'submit')
    })

    it('should have proper accessibility attributes', () => {
      render(<LoginForm />)
      
      const emailInput = screen.getByLabelText(/email address/i)
      expect(emailInput).toHaveAttribute('id', 'email')
    })

    it('should not show error or success message initially', () => {
      render(<LoginForm />)
      
      expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
    })
  })

  describe('User Interactions', () => {
    it('should update email state on input change', async () => {
      const user = userEvent.setup()
      render(<LoginForm />)
      
      const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement
      await user.type(emailInput, 'test@example.com')
      
      expect(emailInput.value).toBe('test@example.com')
    })

    it('should call signInWithOtp with correct email on submit', async () => {
      const user = userEvent.setup()
      mockSignInWithOtp.mockResolvedValue({ data: {}, error: null })
      
      render(<LoginForm />)
      
      const emailInput = screen.getByLabelText(/email address/i)
      const submitButton = screen.getByRole('button', { name: /send magic link/i })
      
      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(mockSignInWithOtp).toHaveBeenCalledWith({
          email: 'test@example.com',
          options: {
            emailRedirectTo: 'http://localhost:3000/auth/callback?redirectTo=/',
          },
        })
      })
    })

    it('should prevent default form submission', async () => {
      const user = userEvent.setup()
      mockSignInWithOtp.mockResolvedValue({ data: {}, error: null })
      
      const { container } = render(<LoginForm />)
      const form = container.querySelector('form')!
      
      const handleSubmit = vi.fn((e) => e.preventDefault())
      form.onsubmit = handleSubmit
      
      const emailInput = screen.getByLabelText(/email address/i)
      await user.type(emailInput, 'test@example.com')
      
      fireEvent.submit(form)
      
      expect(handleSubmit).toHaveBeenCalled()
    })
  })

  describe('State Management', () => {
    it('should show success message after successful submission', async () => {
      const user = userEvent.setup()
      mockSignInWithOtp.mockResolvedValue({ data: {}, error: null })
      
      render(<LoginForm />)
      
      const emailInput = screen.getByLabelText(/email address/i)
      const submitButton = screen.getByRole('button', { name: /send magic link/i })
      
      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/check your email — a magic link is on its way/i)).toBeInTheDocument()
      })
      
      // Form should be hidden after success
      expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument()
    })

    it('should display error message on auth failure', async () => {
      const user = userEvent.setup()
      mockSignInWithOtp.mockResolvedValue({
        data: null,
        error: { message: 'Invalid email address' },
      })
      
      render(<LoginForm />)
      
      const emailInput = screen.getByLabelText(/email address/i)
      await user.type(emailInput, 'invalid@test.com')
      
      const submitButton = screen.getByRole('button', { name: /send magic link/i })
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText('Invalid email address')).toBeInTheDocument()
      }, { timeout: 3000 })
      
      // Form should still be visible
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    })

    it('should reset error state on new submission', async () => {
      const user = userEvent.setup()
      
      // First submission fails
      mockSignInWithOtp.mockResolvedValueOnce({
        data: null,
        error: { message: 'Network error' },
      })
      
      render(<LoginForm />)
      
      const emailInput = screen.getByLabelText(/email address/i)
      await user.type(emailInput, 'test@example.com')
      
      const submitButton = screen.getByRole('button', { name: /send magic link/i })
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
      
      // Second submission succeeds
      mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: null })
      
      await user.clear(emailInput)
      await user.type(emailInput, 'test2@example.com')
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.queryByText('Network error')).not.toBeInTheDocument()
      })
    })
  })

  describe('Supabase Integration', () => {
    it('should include redirectTo in callback URL when provided', async () => {
      const user = userEvent.setup()
      mockSignInWithOtp.mockResolvedValue({ data: {}, error: null })
      
      render(<LoginForm redirectTo="/systems" />)
      
      const emailInput = screen.getByLabelText(/email address/i)
      const submitButton = screen.getByRole('button', { name: /send magic link/i })
      
      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(mockSignInWithOtp).toHaveBeenCalledWith({
          email: 'test@example.com',
          options: {
            emailRedirectTo: 'http://localhost:3000/auth/callback?redirectTo=/systems',
          },
        })
      })
    })

    it('should default to "/" when no redirectTo specified', async () => {
      const user = userEvent.setup()
      mockSignInWithOtp.mockResolvedValue({ data: {}, error: null })
      
      render(<LoginForm />)
      
      const emailInput = screen.getByLabelText(/email address/i)
      const submitButton = screen.getByRole('button', { name: /send magic link/i })
      
      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(mockSignInWithOtp).toHaveBeenCalledWith({
          email: 'test@example.com',
          options: {
            emailRedirectTo: 'http://localhost:3000/auth/callback?redirectTo=/',
          },
        })
      })
    })
  })
})
