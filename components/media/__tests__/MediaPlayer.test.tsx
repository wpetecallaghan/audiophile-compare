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
  // longer forces a bare link; NativePlayer is attempted regardless (a
  // fallback link shows too, by design — step 56 — until playback is
  // confirmed, but the <video> element is mounted and attempting to load
  // it, not skipped outright the way a provider: 'unknown' clip is).
  it('mounts NativePlayer (not just a bare link) for a direct clip with media_type unknown', () => {
    const clip = makeClip({ media_type: 'unknown' })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    expect(document.querySelector('video')).not.toBeNull()
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

  // Build step 56: a Dropbox clip's canonical_url (the rewritten raw=1
  // link) is what actually gets played, not the original share-page
  // source_url — detect-provider.ts computes canonical_url fresh from
  // source_url, so this is the wiring that makes that useful.
  it('uses canonical_url, not source_url, as the media element src when they differ', () => {
    const clip = makeClip({
      source_url: 'https://www.dropbox.com/scl/fi/abc123/clip.mov?rlkey=xyz&dl=0',
      canonical_url: 'https://www.dropbox.com/scl/fi/abc123/clip.mov?rlkey=xyz&raw=1',
    })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    const video = document.querySelector('video') as HTMLVideoElement
    expect(video.src).toBe('https://www.dropbox.com/scl/fi/abc123/clip.mov?rlkey=xyz&raw=1')
  })
})
