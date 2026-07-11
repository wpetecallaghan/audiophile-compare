import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MediaPlayer, { type ClipData } from '../MediaPlayer'

// @vitest-environment jsdom

const makeClip = (overrides: Partial<ClipData>): ClipData => ({
  id: 'test-id',
  label: 'A',
  source_url: 'https://example.com/clip.mov',
  provider: 'direct',
  media_type: 'video',
  ...overrides,
})

describe('MediaPlayer', () => {
  // The core regression guard for build step 54 — media_type 'unknown' no
  // longer forces a bare link; NativePlayer is attempted first regardless.
  it('renders NativePlayer (not a bare link) for a direct clip with media_type unknown', () => {
    const clip = makeClip({ media_type: 'unknown' })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    expect(document.querySelector('video')).not.toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('defaults to a <video> element (not <audio>) for media_type unknown', () => {
    const clip = makeClip({ media_type: 'unknown' })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    expect(document.querySelector('video')).not.toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })

  it('renders an <audio> element for a direct clip with media_type audio', () => {
    const clip = makeClip({ media_type: 'audio' })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    expect(document.querySelector('audio')).not.toBeNull()
  })

  it('renders a bare link for provider unknown (unparseable URL)', () => {
    const clip = makeClip({ provider: 'unknown', media_type: 'unknown' })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    expect(document.querySelector('video')).toBeNull()
    expect(document.querySelector('audio')).toBeNull()
    expect(screen.getByRole('link')).toBeInTheDocument()
  })
})
