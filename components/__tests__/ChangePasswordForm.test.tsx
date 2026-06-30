import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChangePasswordForm from '../ChangePasswordForm'

// --- Mocks ---

const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

const mockUpdateUser = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { updateUser: mockUpdateUser },
  })),
}))

Object.defineProperty(window, 'location', {
  value: { href: 'http://localhost:3000/profile' },
  writable: true,
})

// --- Tests ---

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Collapsed state (autoOpen=false)
  // ---------------------------------------------------------------------------

  describe('Collapsed state', () => {
    it('renders a button to open the change password form', () => {
      render(<ChangePasswordForm />)
      expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument()
    })

    it('does not show password inputs until opened', () => {
      render(<ChangePasswordForm />)
      expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
    })

    it('reveals the form when the button is clicked', async () => {
      const user = userEvent.setup()
      render(<ChangePasswordForm />)

      await user.click(screen.getByRole('button', { name: /change password/i }))

      expect(screen.getByLabelText('New password')).toBeInTheDocument()
      expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Open state (autoOpen=true)
  // ---------------------------------------------------------------------------

  describe('Open state (autoOpen)', () => {
    it('renders password inputs immediately when autoOpen is true', () => {
      render(<ChangePasswordForm autoOpen />)
      expect(screen.getByLabelText('New password')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe('Validation', () => {
    it('shows error when password is shorter than 8 characters', async () => {
      const user = userEvent.setup()
      render(<ChangePasswordForm autoOpen />)

      await user.type(screen.getByLabelText('New password'), 'short')
      await user.type(screen.getByLabelText(/confirm new password/i), 'short')
      await user.click(screen.getByRole('button', { name: /update password/i }))

      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup()
      render(<ChangePasswordForm autoOpen />)

      await user.type(screen.getByLabelText('New password'), 'password1')
      await user.type(screen.getByLabelText(/confirm new password/i), 'password2')
      await user.click(screen.getByRole('button', { name: /update password/i }))

      expect(screen.getByText(/don.t match/i)).toBeInTheDocument()
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('calls updateUser with the new password', async () => {
      const user = userEvent.setup()
      mockUpdateUser.mockResolvedValue({ error: null })

      render(<ChangePasswordForm autoOpen />)

      await user.type(screen.getByLabelText('New password'), 'newpassword1')
      await user.type(screen.getByLabelText(/confirm new password/i), 'newpassword1')
      await user.click(screen.getByRole('button', { name: /update password/i }))

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword1' })
      })
    })

    it('shows success message after update', async () => {
      const user = userEvent.setup()
      mockUpdateUser.mockResolvedValue({ error: null })

      render(<ChangePasswordForm autoOpen />)

      await user.type(screen.getByLabelText('New password'), 'newpassword1')
      await user.type(screen.getByLabelText(/confirm new password/i), 'newpassword1')
      await user.click(screen.getByRole('button', { name: /update password/i }))

      expect(await screen.findByText(/password updated/i)).toBeInTheDocument()
    })

    it('shows "Updating…" while in flight', async () => {
      const user = userEvent.setup()
      mockUpdateUser.mockReturnValue(new Promise(() => {}))

      render(<ChangePasswordForm autoOpen />)

      await user.type(screen.getByLabelText('New password'), 'newpassword1')
      await user.type(screen.getByLabelText(/confirm new password/i), 'newpassword1')
      await user.click(screen.getByRole('button', { name: /update password/i }))

      expect(await screen.findByRole('button', { name: /updating/i })).toBeDisabled()
    })

    it('shows error on auth failure', async () => {
      const user = userEvent.setup()
      mockUpdateUser.mockResolvedValue({ error: { message: 'Password should be at least 6 characters.' } })

      render(<ChangePasswordForm autoOpen />)

      await user.type(screen.getByLabelText('New password'), 'weakpass')
      await user.type(screen.getByLabelText(/confirm new password/i), 'weakpass')
      await user.click(screen.getByRole('button', { name: /update password/i }))

      expect(await screen.findByText(/at least 6/i)).toBeInTheDocument()
    })
  })
})
