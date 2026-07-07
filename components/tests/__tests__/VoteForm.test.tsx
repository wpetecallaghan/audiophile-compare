import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VoteForm from '../VoteForm'
import type { Technique, ExistingVote } from '../VoteForm'

// --- Mocks ---

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

// --- Fixtures ---

const CLIP_A_ID = 'clip-a-uuid'
const CLIP_B_ID = 'clip-b-uuid'
const TEST_ID = 'test-uuid'

const TECHNIQUES: Technique[] = [
  {
    id: 'tech-tune',
    name: 'Tune Method',
    description: 'Rhythmic coherence',
    is_other: false,
  },
  {
    id: 'tech-prat',
    name: 'PRaT',
    description: 'Pace, Rhythm and Timing',
    is_other: false,
  },
  {
    id: 'tech-other',
    name: 'Other',
    description: 'A different approach not listed above',
    is_other: true,
  },
]

function renderForm(
  existingVotes: ExistingVote[] = [],
  techniques: Technique[] = TECHNIQUES,
  hasDeadClip = false,
) {
  return render(
    <VoteForm
      testId={TEST_ID}
      clipAId={CLIP_A_ID}
      clipBId={CLIP_B_ID}
      techniques={techniques}
      existingVotes={existingVotes}
      hasDeadClip={hasDeadClip}
    />,
  )
}

// --- Tests ---

describe('VoteForm', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('Rendering', () => {
    it('renders all technique names and descriptions', () => {
      renderForm()

      expect(screen.getByText('Tune Method')).toBeInTheDocument()
      expect(screen.getByText('Rhythmic coherence')).toBeInTheDocument()
      expect(screen.getByText('PRaT')).toBeInTheDocument()
      expect(screen.getByText('Pace, Rhythm and Timing')).toBeInTheDocument()
      expect(screen.getByText('Other')).toBeInTheDocument()
    })

    it('renders Clip A and Clip B radio buttons for every technique', () => {
      renderForm()

      expect(screen.getAllByRole('radio', { name: /clip a/i })).toHaveLength(
        TECHNIQUES.length,
      )
      expect(screen.getAllByRole('radio', { name: /clip b/i })).toHaveLength(
        TECHNIQUES.length,
      )
    })

    it('disables the submit button when no clips are selected', () => {
      renderForm()

      expect(screen.getByRole('button', { name: /save votes/i })).toBeDisabled()
    })

    it('shows "Cast your vote" heading when there are no existing votes', () => {
      renderForm()

      expect(
        screen.getByRole('heading', { name: /cast your vote/i }),
      ).toBeInTheDocument()
    })

    it('shows "Update your vote" heading when existing votes are provided', () => {
      renderForm([
        {
          technique_id: 'tech-tune',
          chosen_clip_id: CLIP_A_ID,
          other_description: null,
          observation: null,
        },
      ])

      expect(
        screen.getByRole('heading', { name: /update your vote/i }),
      ).toBeInTheDocument()
    })
  })

  describe('Conditional rendering', () => {
    it('does not show any observation textarea before a clip is selected', () => {
      renderForm()

      expect(
        screen.queryByPlaceholderText(/what did you notice/i),
      ).not.toBeInTheDocument()
    })

    it('shows an observation textarea after selecting a clip', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[0])

      expect(
        screen.getByPlaceholderText(/what did you notice/i),
      ).toBeInTheDocument()
    })

    it('does not show the Other description field for regular techniques', async () => {
      const user = userEvent.setup()
      renderForm()

      // Select clip on Tune Method (index 0 — not is_other)
      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[0])

      expect(
        screen.queryByPlaceholderText(/low-level detail retrieval/i),
      ).not.toBeInTheDocument()
    })

    it('shows the Other description field when the Other technique has a clip selected', async () => {
      const user = userEvent.setup()
      renderForm()

      // Other is at index 2
      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[2])

      expect(
        screen.getByPlaceholderText(/low-level detail retrieval/i),
      ).toBeInTheDocument()
    })
  })

  describe('Validation', () => {
    it('shows an error when the Other technique is selected but description is empty', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[2])
      await user.click(screen.getByRole('button', { name: /save votes/i }))

      expect(
        screen.getByText(/please describe your criterion for the "other" technique/i),
      ).toBeInTheDocument()
    })

    it('does not call fetch when validation fails', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[2])
      await user.click(screen.getByRole('button', { name: /save votes/i }))

      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Submission', () => {
    it('enables the submit button once any clip is selected', async () => {
      const user = userEvent.setup()
      renderForm()

      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[0])

      expect(
        screen.getByRole('button', { name: /save votes/i }),
      ).not.toBeDisabled()
    })

    it('calls fetch with only the voted techniques in the payload', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      renderForm()

      // Vote only on Tune Method (index 0); leave PRaT and Other blank
      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[0])
      await user.click(screen.getByRole('button', { name: /save votes/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/votes',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              test_id: TEST_ID,
              votes: [{ technique_id: 'tech-tune', chosen_clip_id: CLIP_A_ID }],
            }),
          }),
        )
      })
    })

    it('includes the observation when provided', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      renderForm()

      await user.click(screen.getAllByRole('radio', { name: /clip b/i })[0])
      await user.type(
        screen.getByPlaceholderText(/what did you notice/i),
        'Clip B had better rhythm',
      )
      await user.click(screen.getByRole('button', { name: /save votes/i }))

      await waitFor(() => {
        const body = JSON.parse(
          (mockFetch.mock.calls[0][1] as RequestInit).body as string,
        )
        expect(body.votes[0].observation).toBe('Clip B had better rhythm')
        expect(body.votes[0].chosen_clip_id).toBe(CLIP_B_ID)
      })
    })

    it('calls router.refresh() on successful submission', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      renderForm()

      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[0])
      await user.click(screen.getByRole('button', { name: /save votes/i }))

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalledOnce()
      })
    })

    it('shows the API error message on a failed submission', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'Cannot vote on a revealed test' }),
          { status: 409 },
        ),
      )
      renderForm()

      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[0])
      await user.click(screen.getByRole('button', { name: /save votes/i }))

      await waitFor(() => {
        expect(
          screen.getByText('Cannot vote on a revealed test'),
        ).toBeInTheDocument()
      })
      expect(mockRefresh).not.toHaveBeenCalled()
    })

    it('shows a network error message when fetch throws', async () => {
      const user = userEvent.setup()
      mockFetch.mockRejectedValue(new Error('network failure'))
      renderForm()

      await user.click(screen.getAllByRole('radio', { name: /clip a/i })[0])
      await user.click(screen.getByRole('button', { name: /save votes/i }))

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument()
      })
    })
  })

  describe('Pre-population from existing votes', () => {
    it('pre-selects the correct radio button from existing votes', () => {
      renderForm([
        {
          technique_id: 'tech-tune',
          chosen_clip_id: CLIP_B_ID,
          other_description: null,
          observation: null,
        },
      ])

      const clipBRadios = screen.getAllByRole('radio', { name: /clip b/i })
      const clipARadios = screen.getAllByRole('radio', { name: /clip a/i })

      expect(clipBRadios[0]).toBeChecked()
      expect(clipARadios[0]).not.toBeChecked()
      // Other techniques should be unchecked
      expect(clipARadios[1]).not.toBeChecked()
      expect(clipBRadios[1]).not.toBeChecked()
    })

    it('pre-fills the observation textarea from existing votes', () => {
      renderForm([
        {
          technique_id: 'tech-tune',
          chosen_clip_id: CLIP_A_ID,
          other_description: null,
          observation: 'Clip A had better timing',
        },
      ])

      const textarea = screen.getByPlaceholderText(
        /what did you notice/i,
      ) as HTMLTextAreaElement
      expect(textarea.value).toBe('Clip A had better timing')
    })

    it('shows "Update votes" button label when existing votes are provided', () => {
      renderForm([
        {
          technique_id: 'tech-tune',
          chosen_clip_id: CLIP_A_ID,
          other_description: null,
          observation: null,
        },
      ])

      expect(
        screen.getByRole('button', { name: /update votes/i }),
      ).toBeInTheDocument()
    })
  })

  describe('hasDeadClip', () => {
    it('renders normally when hasDeadClip is false (default)', () => {
      renderForm()

      expect(screen.getByRole('button', { name: /save votes/i })).toBeInTheDocument()
      expect(screen.queryByText(/voting is paused/i)).not.toBeInTheDocument()
    })

    it('shows an explanatory message instead of the form when hasDeadClip is true', () => {
      renderForm([], TECHNIQUES, true)

      expect(screen.getByText(/voting is paused/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /save votes/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    })
  })
})
