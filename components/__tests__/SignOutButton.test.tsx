import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignOutButton from '../SignOutButton'

// --- Mocks ---

const mockSignOut = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { signOut: mockSignOut },
  })),
}))

// --- Tests ---

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignOut.mockResolvedValue({})
  })

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders a "Sign out" button', () => {
      render(<SignOutButton />)
      expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Sign-out behaviour
  // ---------------------------------------------------------------------------

  describe('Sign-out behaviour', () => {
    it('calls supabase.auth.signOut() when clicked', async () => {
      const user = userEvent.setup()
      render(<SignOutButton />)

      await user.click(screen.getByRole('button', { name: 'Sign out' }))

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledOnce()
      })
    })

    it('navigates to / after sign-out completes', async () => {
      const user = userEvent.setup()
      render(<SignOutButton />)

      await user.click(screen.getByRole('button', { name: 'Sign out' }))

      await waitFor(() => {
        expect(window.location.href).toBe('/')
      })
    })

    it('shows "Signing out…" and disables the button while in flight', async () => {
      const user = userEvent.setup()
      let resolve: () => void
      mockSignOut.mockReturnValue(new Promise<void>(r => { resolve = r }))

      render(<SignOutButton />)

      await user.click(screen.getByRole('button', { name: 'Sign out' }))

      expect(screen.getByRole('button', { name: 'Signing out\u2026' })).toBeDisabled()

      // Clean up
      resolve!()
    })
  })
})
