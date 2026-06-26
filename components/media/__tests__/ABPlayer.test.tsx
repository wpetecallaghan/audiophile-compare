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
})