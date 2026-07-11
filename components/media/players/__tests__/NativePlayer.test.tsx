import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import NativePlayer, { type PlayerHandle } from '../NativePlayer'

// @vitest-environment jsdom

describe('NativePlayer', () => {
  // Build step 57: NativePlayer has no fallback UI of its own — a link to
  // the clip's original source is always rendered one level up in
  // MediaPlayer.tsx instead, regardless of provider or load state. This
  // guards against silently reintroducing a duplicate link here.
  it('never renders a link itself, at any state', () => {
    render(<NativePlayer url="https://example.com/clip.mov" mediaType="video" onPlay={vi.fn()} />)
    expect(screen.queryByRole('link')).toBeNull()

    fireEvent.loadedMetadata(document.querySelector('video')!)
    expect(screen.queryByRole('link')).toBeNull()

    fireEvent.error(document.querySelector('video')!)
    expect(screen.queryByRole('link')).toBeNull()
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

  it('reveals the media element once metadata loads', () => {
    render(<NativePlayer url="https://example.com/clip.mov" mediaType="video" onPlay={vi.fn()} />)

    fireEvent.loadedMetadata(document.querySelector('video')!)

    expect(document.querySelector('video')!.className).not.toContain('hidden')
  })

  it('calls onPlay when the media element fires its play event', () => {
    const onPlay = vi.fn()
    render(<NativePlayer url="https://example.com/clip.mov" mediaType="video" onPlay={onPlay} />)

    fireEvent.play(document.querySelector('video')!)

    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('keeps the media element hidden if it errors — no state to recover from', () => {
    render(<NativePlayer url="https://example.com/not-actually-playable" mediaType="video" onPlay={vi.fn()} />)

    fireEvent.error(document.querySelector('video')!)

    expect(document.querySelector('video')!.className).toContain('hidden')
  })

  it('does not throw when pause() is called via ref before the media element has loaded', () => {
    const ref = createRef<PlayerHandle>()
    render(<NativePlayer ref={ref} url="https://example.com/clip.mov" mediaType="video" onPlay={vi.fn()} />)

    expect(() => ref.current?.pause()).not.toThrow()
  })

  it('resets to hidden again when the url prop changes', () => {
    const { rerender } = render(
      <NativePlayer url="https://example.com/clip-a.mov" mediaType="video" onPlay={vi.fn()} />,
    )
    fireEvent.loadedMetadata(document.querySelector('video')!)
    expect(document.querySelector('video')!.className).not.toContain('hidden')

    rerender(<NativePlayer url="https://example.com/clip-b.mov" mediaType="video" onPlay={vi.fn()} />)

    expect(document.querySelector('video')!.className).toContain('hidden')
  })
})
