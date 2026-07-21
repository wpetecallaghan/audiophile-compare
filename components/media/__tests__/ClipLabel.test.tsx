import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClipLabel } from '../ClipLabel'

// @vitest-environment jsdom

describe('ClipLabel', () => {
  it('renders its children inside an h2', () => {
    render(<ClipLabel>Clip A</ClipLabel>)

    const heading = screen.getByText('Clip A')
    expect(heading.tagName).toBe('H2')
  })

  it('applies the shared uppercase eyebrow styling', () => {
    render(<ClipLabel>Clip B</ClipLabel>)

    const heading = screen.getByText('Clip B')
    expect(heading.className).toContain('uppercase')
    expect(heading.className).toContain('tracking-wide')
  })
})
