import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import NativePlayer, { type PlayerHandle } from '../NativePlayer'

// @vitest-environment jsdom

describe('NativePlayer', () => {
  // The core behavior for build step 56's redesign: no timeout to guess —
  // the fallback link is the default, visible from first render, so a
  // clip that never resolves (errors, hangs, or is a Google Photos-style
  // HTML page) never needs a "give up" moment. It was already showing.
  it('shows the fallback link immediately, before the media element has loaded', () => {
    const url = 'https://example.com/clip.mov'
    render(<NativePlayer url={url} mediaType="video" onPlay={vi.fn()} />)

    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  it('renders an <audio> element for mediaType audio, mounted but hidden until loaded', () => {
    render(<NativePlayer url="https://example.com/audio.mp3" mediaType="audio" onPlay={vi.fn()} />)

    const audio = document.querySelector('audio')
    expect(audio).not.toBeNull()
    expect(audio!.className).toContain('hidden')
  })

  it('renders a <video> element for mediaType video, mounted but hidden until loaded', () => {
    render(<NativePlayer url="https://example.com/clip.mov" mediaType="video" onPlay={vi.fn()} />)

    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    expect(video!.className).toContain('hidden')
  })

  it('reveals the media element and hides the fallback link once metadata loads', () => {
    render(<NativePlayer url="https://example.com/clip.mov" mediaType="video" onPlay={vi.fn()} />)

    fireEvent.loadedMetadata(document.querySelector('video')!)

    expect(document.querySelector('video')!.className).not.toContain('hidden')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('calls onPlay when the media element fires its play event', () => {
    const onPlay = vi.fn()
    render(<NativePlayer url="https://example.com/clip.mov" mediaType="video" onPlay={onPlay} />)

    fireEvent.play(document.querySelector('video')!)

    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the fallback link if the media element errors — no state to recover from', () => {
    const url = 'https://example.com/not-actually-playable'
    render(<NativePlayer url={url} mediaType="video" onPlay={vi.fn()} />)

    fireEvent.error(document.querySelector('video')!)

    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.href).toBe(url)
  })

  it('does not throw when pause() is called via ref before the media element has loaded', () => {
    const ref = createRef<PlayerHandle>()
    render(<NativePlayer ref={ref} url="https://example.com/clip.mov" mediaType="video" onPlay={vi.fn()} />)

    expect(() => ref.current?.pause()).not.toThrow()
  })

  // Build step 56: a Dropbox clip plays via its rewritten raw=1
  // canonical_url, but the fallback link should point at the original,
  // human-friendly share page instead of the raw stream URL —
  // fallbackUrl is what lets those diverge.
  it('uses fallbackUrl, not url, for the link when the two differ', () => {
    const playableUrl = 'https://www.dropbox.com/scl/fi/abc/clip.mov?rlkey=xyz&raw=1'
    const shareUrl = 'https://www.dropbox.com/scl/fi/abc/clip.mov?rlkey=xyz&dl=0'
    render(<NativePlayer url={playableUrl} fallbackUrl={shareUrl} mediaType="video" onPlay={vi.fn()} />)

    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.href).toBe(shareUrl)
  })

  it('resets to showing the fallback link again when the url prop changes', () => {
    const { rerender } = render(
      <NativePlayer url="https://example.com/clip-a.mov" mediaType="video" onPlay={vi.fn()} />,
    )
    fireEvent.loadedMetadata(document.querySelector('video')!)
    expect(screen.queryByRole('link')).toBeNull()

    rerender(<NativePlayer url="https://example.com/clip-b.mov" mediaType="video" onPlay={vi.fn()} />)

    expect(screen.getByRole('link')).toBeInTheDocument()
  })
})
