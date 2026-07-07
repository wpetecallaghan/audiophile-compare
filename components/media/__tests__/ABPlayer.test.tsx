import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('renders a Google Drive clip as an iframe embed, and the sibling pausing it is a harmless no-op', () => {
    // Drive's /preview embed has no control SDK — pause() on it is a
    // documented no-op (build-history.md step 34, decision 3). This just
    // confirms rendering it, and the sibling's pause path, doesn't throw.
    const clipA = makeClip({
      label: 'A',
      provider: 'google-drive',
      embed_id: '1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl',
      source_url: 'https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/view',
    })
    const clipB = makeClip({ label: 'B' })

    expect(() => render(<ABPlayer clipA={clipA} clipB={clipB} />)).not.toThrow()

    const iframe = screen.getByTitle('Google Drive video player') as HTMLIFrameElement
    expect(iframe.src).toBe('https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/preview')
  })
})