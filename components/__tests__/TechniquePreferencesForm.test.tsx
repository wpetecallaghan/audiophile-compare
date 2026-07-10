import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TechniquePreferencesForm from '../TechniquePreferencesForm'
import type { Technique } from '../tests/VoteForm'

// --- Fixtures ---

const TECHNIQUES: Technique[] = [
  { id: 'tune',  name: 'Tune Method',  description: 'Long-term listening',    is_other: false },
  { id: 'prat',  name: 'PRaT',         description: 'Rhythm and timing',      is_other: false },
  { id: 'other', name: 'Other',        description: 'Something else',         is_other: true  },
]

describe('TechniquePreferencesForm', () => {
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
    it('renders one checkbox per technique, checked per initialEnabledIds', () => {
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune', 'other']} />)

      expect(screen.getByRole('checkbox', { name: /tune method/i })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: /prat/i })).not.toBeChecked()
      expect(screen.getByRole('checkbox', { name: /^other/i })).toBeChecked()
    })

    it('renders every technique checked when initialEnabledIds covers all of them (default)', () => {
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune', 'prat', 'other']} />)

      for (const t of TECHNIQUES) {
        expect(screen.getByRole('checkbox', { name: new RegExp(t.name, 'i') })).toBeChecked()
      }
    })

    it('renders technique name and description', () => {
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune']} />)

      expect(screen.getByText('Tune Method')).toBeInTheDocument()
      expect(screen.getByText('Long-term listening')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe('Validation', () => {
    it('disables Save when the last checked technique is unchecked', async () => {
      const user = userEvent.setup()
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune']} />)

      await user.click(screen.getByRole('checkbox', { name: /tune method/i }))

      expect(screen.getByRole('button', { name: 'Save listening methods' })).toBeDisabled()
    })

    it('shows the min-technique error when zero are checked', async () => {
      const user = userEvent.setup()
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune']} />)

      await user.click(screen.getByRole('checkbox', { name: /tune method/i }))

      expect(screen.getByText('Select at least one listening method.')).toBeInTheDocument()
    })

    it('enables Save once at least one technique is checked', () => {
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune']} />)
      expect(screen.getByRole('button', { name: 'Save listening methods' })).not.toBeDisabled()
    })

    it('re-enables Save after re-checking a technique', async () => {
      const user = userEvent.setup()
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune']} />)

      const checkbox = screen.getByRole('checkbox', { name: /tune method/i })
      await user.click(checkbox)
      expect(screen.getByRole('button', { name: 'Save listening methods' })).toBeDisabled()

      await user.click(checkbox)
      expect(screen.getByRole('button', { name: 'Save listening methods' })).not.toBeDisabled()
    })
  })

  // ---------------------------------------------------------------------------
  // Submission
  // ---------------------------------------------------------------------------

  describe('Submission', () => {
    it('PATCHes to /api/profile/technique-preferences with only the checked ids', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ technique_ids: ['tune'] }), { status: 200 }),
      )
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune', 'prat']} />)

      await user.click(screen.getByRole('checkbox', { name: /prat/i }))
      await user.click(screen.getByRole('button', { name: 'Save listening methods' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/profile/technique-preferences',
          expect.objectContaining({
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ technique_ids: ['tune'] }),
          }),
        )
      })
    })

    it('shows a success message on success', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ technique_ids: ['tune'] }), { status: 200 }),
      )
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune']} />)

      await user.click(screen.getByRole('button', { name: 'Save listening methods' }))

      await waitFor(() => {
        expect(screen.getByText('Listening method preferences updated.')).toBeInTheDocument()
      })
    })

    it('clears the success message when a checkbox is toggled after a save', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ technique_ids: ['tune', 'prat'] }), { status: 200 }),
      )
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune', 'prat']} />)

      await user.click(screen.getByRole('button', { name: 'Save listening methods' }))
      await waitFor(() => {
        expect(screen.getByText('Listening method preferences updated.')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('checkbox', { name: /^other/i }))

      expect(screen.queryByText('Listening method preferences updated.')).not.toBeInTheDocument()
    })

    it('shows server error and keeps the form open on API failure', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Failed to update technique preferences' }), { status: 500 }),
      )
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune']} />)

      await user.click(screen.getByRole('button', { name: 'Save listening methods' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to update technique preferences')).toBeInTheDocument()
      })
      expect(screen.getByRole('checkbox', { name: /tune method/i })).toBeInTheDocument()
    })

    it('shows a network error when fetch throws', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('network'))
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune']} />)

      await user.click(screen.getByRole('button', { name: 'Save listening methods' }))

      await waitFor(() => {
        expect(screen.getByText('Network error — please try again')).toBeInTheDocument()
      })
    })

    it('shows "Saving…" and disables the button while in flight', async () => {
      const user = userEvent.setup()
      let resolve: (v: Response) => void
      mockFetch.mockReturnValue(new Promise<Response>(r => { resolve = r }))
      render(<TechniquePreferencesForm techniques={TECHNIQUES} initialEnabledIds={['tune']} />)

      await user.click(screen.getByRole('button', { name: 'Save listening methods' }))

      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()

      // Clean up
      resolve!(new Response(JSON.stringify({ technique_ids: ['tune'] }), { status: 200 }))
    })
  })
})
