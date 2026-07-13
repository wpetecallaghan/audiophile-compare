import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SignOutButton from '../SignOutButton'

// --- Mocks ---

let mockFetch: ReturnType<typeof vi.fn>

// --- Tests ---

describe('SignOutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    it('POSTs to /auth/signout when clicked', async () => {
      const user = userEvent.setup()
      render(<SignOutButton />)

      await user.click(screen.getByRole('button', { name: 'Sign out' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/auth/signout', { method: 'POST' })
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
      let resolve: (value: { ok: boolean }) => void
      mockFetch.mockReturnValue(new Promise<{ ok: boolean }>(r => { resolve = r }))

      render(<SignOutButton />)

      await user.click(screen.getByRole('button', { name: 'Sign out' }))

      expect(screen.getByRole('button', { name: 'Signing out\u2026' })).toBeDisabled()

      // Clean up
      resolve!({ ok: true })
    })
  })
})
