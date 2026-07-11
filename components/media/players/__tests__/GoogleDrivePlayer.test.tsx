import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRef } from 'react'
import { render, screen, act } from '@testing-library/react'
import GoogleDrivePlayer from '../GoogleDrivePlayer'
import type { PlayerHandle } from '../NativePlayer'

// @vitest-environment jsdom

const VIDEO_ID = '1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl'
const POLL_MS = 200

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GoogleDrivePlayer', () => {
  it('calls onPlay when focus moves into its iframe (build step 53)', () => {
    const onPlay = vi.fn()
    render(<GoogleDrivePlayer videoId={VIDEO_ID} onPlay={onPlay} />)

    const iframe = screen.getByTitle('Google Drive video player')
    act(() => {
      iframe.focus()
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('does not call onPlay when the active element is unrelated', () => {
    const onPlay = vi.fn()
    render(<GoogleDrivePlayer videoId={VIDEO_ID} onPlay={onPlay} />)

    // No focus() call — document.activeElement is not this iframe
    act(() => {
      vi.advanceTimersByTime(POLL_MS)
    })

    expect(onPlay).not.toHaveBeenCalled()
  })

  // The actual bug this step fixed: a naive implementation (window 'blur',
  // or document 'focusin') only ever detects the *first* focus transfer
  // into an iframe — switching focus away and back again (the real
  // A-then-B-then-A comparison workflow) silently stopped working after
  // one click. Polling document.activeElement is what catches every
  // transition, not just the first — this test is the regression guard
  // for that specific failure mode, confirmed against the real reported
  // test (build-history/53-*.md) before landing this implementation.
  it('fires onPlay again on a second, later focus transfer into the same iframe', () => {
    const onPlay = vi.fn()
    render(<GoogleDrivePlayer videoId={VIDEO_ID} onPlay={onPlay} />)
    const iframe = screen.getByTitle('Google Drive video player')

    act(() => {
      iframe.focus()
      vi.advanceTimersByTime(POLL_MS)
    })
    expect(onPlay).toHaveBeenCalledTimes(1)

    act(() => {
      // Focus moves elsewhere (simulating the user switching to the
      // sibling clip), then back to this iframe.
      iframe.blur()
      vi.advanceTimersByTime(POLL_MS)
      iframe.focus()
      vi.advanceTimersByTime(POLL_MS)
    })
    expect(onPlay).toHaveBeenCalledTimes(2)
  })

  it('force-remounts the iframe when pause() is called, since no real pause exists (build step 53)', () => {
    const ref = createRef<PlayerHandle>()
    render(<GoogleDrivePlayer ref={ref} videoId={VIDEO_ID} onPlay={vi.fn()} />)

    const before = screen.getByTitle('Google Drive video player')

    act(() => {
      ref.current?.pause()
    })

    const after = screen.getByTitle('Google Drive video player')
    expect(after).not.toBe(before)
  })
})
