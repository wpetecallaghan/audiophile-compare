import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StepClips from '../steps/StepClips'
import type { Snapshot, TestDraft, VerifiedClip } from '@/lib/types/test-creation'
import { STATUS_OK } from '@/lib/clips/check-url'
import { PROVIDER_YOUTUBE, MEDIA_TYPE_VIDEO } from '@/lib/clips/detect-provider'

// --- Fixtures ---

const SNAPSHOT_A: Snapshot = {
  id: 'snap-a', version: 2, label: 'Furutech cable upgrade',
  notes: null, components: null, created_at: '2024-01-01T00:00:00Z',
}
const SNAPSHOT_B: Snapshot = {
  id: 'snap-b', version: 1, label: 'Baseline',
  notes: null, components: null, created_at: '2024-01-02T00:00:00Z',
}

const VERIFIED: VerifiedClip = {
  provider: PROVIDER_YOUTUBE, media_type: MEDIA_TYPE_VIDEO, url_status: STATUS_OK,
  canonical_url: 'https://youtube.com/watch?v=abc', embed_id: 'abc',
}

const BASE_DRAFT: TestDraft = {
  track: null, snapshotA: SNAPSHOT_A, snapshotB: SNAPSHOT_B,
  clipAUrl: 'https://youtube.com/watch?v=abc', clipAVerified: VERIFIED,
  clipBUrl: 'https://youtube.com/watch?v=def', clipBVerified: VERIFIED,
  beforeIsA: true, title: '',
}

function renderStep(draft: TestDraft, onComplete = vi.fn()) {
  render(<StepClips draft={draft} onComplete={onComplete} />)
  return { onComplete }
}

// --- Tests ---

describe('StepClips', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the question with Clip A's snapshot name interpolated", () => {
    renderStep(BASE_DRAFT)
    // en.json's beforeQuestion uses doubled single quotes (`''`) around
    // {snapshot} — real ICU MessageFormat needs that to escape a literal
    // apostrophe next to a placeholder (a bare `'{snapshot}'` would have
    // ICU treat the quotes as a "start literal text" escape and swallow
    // the placeholder entirely — caught via manual browser verification,
    // not this test's simplified next-intl mock, which does plain
    // {variable} substitution with no ICU quote semantics, so it renders
    // the doubled quotes through unescaped).
    expect(
      screen.getByText("Which clip is ''v2 — Furutech cable upgrade''?"),
    ).toBeInTheDocument()
  })

  it('renders both radio labels with that same snapshot name substituted for "before"', () => {
    renderStep(BASE_DRAFT)
    expect(screen.getByText('Clip A is v2 — Furutech cable upgrade')).toBeInTheDocument()
    expect(screen.getByText('Clip B is v2 — Furutech cable upgrade')).toBeInTheDocument()
  })

  it('completes with beforeIsA: true when the default (Clip A) radio is left untouched', async () => {
    const user = userEvent.setup()
    const { onComplete } = renderStep(BASE_DRAFT)

    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ beforeIsA: true }),
    )
  })

  it('completes with beforeIsA: false after selecting the Clip B radio', async () => {
    const user = userEvent.setup()
    const { onComplete } = renderStep(BASE_DRAFT)

    await user.click(screen.getByText('Clip B is v2 — Furutech cable upgrade'))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ beforeIsA: false }),
    )
  })

  it('renders without crashing and shows an empty snapshot name when snapshotA is null', () => {
    renderStep({ ...BASE_DRAFT, snapshotA: null })
    expect(screen.getByText("Which clip is ''''?")).toBeInTheDocument()
  })
})
