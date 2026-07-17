import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ABPlayer from '../ABPlayer'
import type { ClipData } from '../MediaPlayer'

// Install testing library for React components
// Run: npm install -D @testing-library/react @testing-library/user-event jsdom
// Then change vitest.config.ts environment to 'jsdom' for this test file
// by adding a docblock at the top (shown below)

// @vitest-environment jsdom

const makeClip = (overrides: Partial<ClipData>): ClipData => ({
  id: 'test-id',
  label: 'A',
  source_url: 'https://example.com/audio.mp3',
  provider: 'direct',
  media_type: 'audio',
  ...overrides,
})

describe('ABPlayer', () => {
  it('renders labels for both clips', () => {
    const clipA = makeClip({ label: 'A' })
    const clipB = makeClip({ label: 'B' })

    render(<ABPlayer clipA={clipA} clipB={clipB} />)

    expect(screen.getByText('Clip A')).toBeDefined()
    expect(screen.getByText('Clip B')).toBeDefined()
  })

  it('hides Clip A entirely when hideClipA is true', () => {
    const clipA = makeClip({ label: 'A' })
    const clipB = makeClip({ label: 'B' })

    render(<ABPlayer clipA={clipA} clipB={clipB} hideClipA />)

    expect(screen.queryByText('Clip A')).not.toBeInTheDocument()
    expect(screen.getByText('Clip B')).toBeInTheDocument()
  })

  it('hides Clip B entirely when hideClipB is true', () => {
    const clipA = makeClip({ label: 'A' })
    const clipB = makeClip({ label: 'B' })

    render(<ABPlayer clipA={clipA} clipB={clipB} hideClipB />)

    expect(screen.getByText('Clip A')).toBeInTheDocument()
    expect(screen.queryByText('Clip B')).not.toBeInTheDocument()
  })

  it('renders a Google Drive clip as an iframe embed with the expected preview src', async () => {
    // Drive's /preview embed has no control SDK, so play/pause coordination
    // is approximated instead of exact (build step 53) — see
    // GoogleDrivePlayer.test.tsx for that behavior. This just confirms
    // rendering it doesn't throw and the iframe src is correct.
    //
    // Build step 76: the real iframe is deferred behind ClipFacade — click
    // its play button first, same as MediaPlayer.test.tsx's lazy-mounting
    // tests.
    const user = userEvent.setup()
    const clipA = makeClip({
      label: 'A',
      provider: 'google-drive',
      embed_id: '1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl',
      source_url: 'https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/view',
    })
    const clipB = makeClip({ label: 'B' })

    expect(() => render(<ABPlayer clipA={clipA} clipB={clipB} />)).not.toThrow()

    await user.click(screen.getByRole('button', { name: 'Play clip A' }))

    const iframe = screen.getByTitle('Google Drive video player') as HTMLIFrameElement
    expect(iframe.src).toBe('https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/preview?autoplay=1')
  })

  // Real reported bug, build step 76: activating clip B while clip A (a
  // Google Drive clip) was playing left both audible at once. Root cause
  // was in GoogleDrivePlayer.tsx — pause()'s forced iframe remount kept
  // recomputing its src from the same `autoplay` prop, so the "paused"
  // reload just autoplayed straight back into playing. This is the
  // end-to-end regression guard, through the real ABPlayer pause-
  // coordination path (not just GoogleDrivePlayer.test.tsx's unit test).
  it('actually silences clip A (no longer autoplaying) once clip B is activated', async () => {
    const user = userEvent.setup()
    const clipA = makeClip({
      label: 'A',
      provider: 'google-drive',
      embed_id: 'clip-a-drive-id',
      source_url: 'https://drive.google.com/file/d/clip-a-drive-id/view',
    })
    const clipB = makeClip({
      label: 'B',
      provider: 'google-drive',
      embed_id: 'clip-b-drive-id',
      source_url: 'https://drive.google.com/file/d/clip-b-drive-id/view',
    })

    render(<ABPlayer clipA={clipA} clipB={clipB} />)

    await user.click(screen.getByRole('button', { name: 'Play clip A' }))
    const iframesAfterA = screen.getAllByTitle('Google Drive video player') as HTMLIFrameElement[]
    expect(iframesAfterA.find(f => f.src.includes('clip-a-drive-id'))?.src).toBe(
      'https://drive.google.com/file/d/clip-a-drive-id/preview?autoplay=1',
    )

    await user.click(screen.getByRole('button', { name: 'Play clip B' }))

    const iframesAfterB = screen.getAllByTitle('Google Drive video player') as HTMLIFrameElement[]
    const clipAIframe = iframesAfterB.find(f => f.src.includes('clip-a-drive-id'))
    const clipBIframe = iframesAfterB.find(f => f.src.includes('clip-b-drive-id'))
    expect(clipAIframe?.src).toBe('https://drive.google.com/file/d/clip-a-drive-id/preview')
    expect(clipBIframe?.src).toBe('https://drive.google.com/file/d/clip-b-drive-id/preview?autoplay=1')
  })
})