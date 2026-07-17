import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClipFacade } from '../ClipFacade'

// @vitest-environment jsdom

describe('ClipFacade', () => {
  it('renders the thumbnail image when a thumbnailUrl is given', () => {
    render(
      <ClipFacade
        thumbnailUrl="https://img.youtube.com/vi/abc123/hqdefault.jpg"
        playLabel="Play clip A"
        onActivate={vi.fn()}
      />
    )

    const image = document.querySelector('img') as HTMLImageElement
    expect(image.src).toBe('https://img.youtube.com/vi/abc123/hqdefault.jpg')
  })

  // Google Drive has no public thumbnail (build step 76) — the facade must
  // still render a usable play button with no <img> at all.
  it('renders without an <img> when thumbnailUrl is null', () => {
    render(
      <ClipFacade thumbnailUrl={null} playLabel="Play clip B" onActivate={vi.fn()} />
    )

    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Play clip B' })).toBeInTheDocument()
  })

  it('calls onActivate when the play button is clicked', async () => {
    const onActivate = vi.fn()
    const user = userEvent.setup()
    render(
      <ClipFacade thumbnailUrl={null} playLabel="Play clip A" onActivate={onActivate} />
    )

    await user.click(screen.getByRole('button', { name: 'Play clip A' }))

    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('exposes the play button with the given aria-label', () => {
    render(
      <ClipFacade thumbnailUrl={null} playLabel="Play clip A" onActivate={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: 'Play clip A' })).toBeInTheDocument()
  })
})
