import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import OAuthButtons from '../components/OAuthButtons'

const mockSignInWithOAuth = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  })),
}))

describe('OAuthButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null })
  })

  it('renders a Continue with Google button', () => {
    render(<OAuthButtons />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  })

  it('calls signInWithOAuth with provider google when button is clicked', async () => {
    const user = userEvent.setup()
    render(<OAuthButtons />)
    await user.click(screen.getByRole('button', { name: /continue with google/i }))
    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    )
  })

  it('includes /auth/callback in the redirectTo option', async () => {
    const user = userEvent.setup()
    render(<OAuthButtons />)
    await user.click(screen.getByRole('button', { name: /continue with google/i }))
    const call = mockSignInWithOAuth.mock.calls[0][0]
    expect(call.options.redirectTo).toContain('/auth/callback')
  })

  it('appends the redirectTo prop to the callback URL when provided', async () => {
    const user = userEvent.setup()
    render(<OAuthButtons redirectTo="/systems" />)
    await user.click(screen.getByRole('button', { name: /continue with google/i }))
    const call = mockSignInWithOAuth.mock.calls[0][0]
    expect(call.options.redirectTo).toContain('redirectTo=/systems')
  })

  it('falls back to / when no redirectTo prop is provided', async () => {
    const user = userEvent.setup()
    render(<OAuthButtons />)
    await user.click(screen.getByRole('button', { name: /continue with google/i }))
    const call = mockSignInWithOAuth.mock.calls[0][0]
    expect(call.options.redirectTo).toContain('redirectTo=/')
  })
})
