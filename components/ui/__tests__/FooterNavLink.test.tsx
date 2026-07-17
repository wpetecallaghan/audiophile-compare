import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FooterNavLink } from '../FooterNavLink'

describe('FooterNavLink', () => {
  it('renders its icon child, with the given href and aria-label', () => {
    render(
      <FooterNavLink href="/tests/abc" aria-label="Next test">
        <svg data-testid="icon" />
      </FooterNavLink>
    )

    const link = screen.getByRole('link', { name: 'Next test' })
    expect(link).toHaveAttribute('href', '/tests/abc')
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('sizes the tap target to at least 44x44 (w-11 h-11), not just the icon (build step 68)', () => {
    render(
      <FooterNavLink href="/tests/abc" aria-label="Next test">
        <svg data-testid="icon" />
      </FooterNavLink>
    )

    const link = screen.getByRole('link', { name: 'Next test' })
    expect(link.className).toContain('w-11')
    expect(link.className).toContain('h-11')
  })
})
