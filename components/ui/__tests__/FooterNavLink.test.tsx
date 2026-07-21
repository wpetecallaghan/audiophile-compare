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

  // Build step 77: a null href renders a disabled button in the same slot
  // instead of omitting the control entirely — the fix for the
  // First/Previous/Next/Last row visibly shifting position at a boundary
  // (see build-history/77-*.md). These guard the disabled branch itself;
  // the position-stability regression is covered end-to-end in e2e.
  it('renders a disabled button (not a link) when href is null', () => {
    render(
      <FooterNavLink href={null} aria-label="Previous test">
        <svg data-testid="icon" />
      </FooterNavLink>
    )

    expect(screen.queryByRole('link', { name: 'Previous test' })).not.toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Previous test' })
    expect(button).toBeDisabled()
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('sizes the disabled button to the same 44x44 tap target as the enabled link', () => {
    render(
      <FooterNavLink href={null} aria-label="Previous test">
        <svg data-testid="icon" />
      </FooterNavLink>
    )

    const button = screen.getByRole('button', { name: 'Previous test' })
    expect(button.className).toContain('w-11')
    expect(button.className).toContain('h-11')
  })

  // Reuses this codebase's existing disabled-button convention
  // (components/ui/Button.tsx, components/ui/ConfirmButton.tsx) rather
  // than inventing a new visual treatment.
  it('dims the disabled button via the existing disabled:opacity-40 convention', () => {
    render(
      <FooterNavLink href={null} aria-label="Previous test">
        <svg data-testid="icon" />
      </FooterNavLink>
    )

    const button = screen.getByRole('button', { name: 'Previous test' })
    expect(button.className).toContain('disabled:opacity-40')
  })

  // Real follow-up bug, reported directly: opacity-40 alone wasn't enough
  // to tell disabled from enabled at a glance, in either theme. Root
  // cause was that the disabled button had no explicit base text color,
  // so it dimmed the page's near-black/near-white body foreground
  // (app/globals.css) instead of the enabled Link's own muted gray —
  // composited to a similarly-toned mid-gray as the enabled state either
  // way. Fixed by starting the disabled button from the exact same
  // `text-muted` token (build step 83; was the literal `text-gray-500
  // dark:text-gray-400` pair) the enabled Link uses, so dimming it
  // actually reads as "this control, grayed out."
  it('starts the disabled button from the same base gray as the enabled link, before dimming it', () => {
    render(
      <FooterNavLink href={null} aria-label="Previous test">
        <svg data-testid="icon" />
      </FooterNavLink>
    )

    const button = screen.getByRole('button', { name: 'Previous test' })
    expect(button.className).toContain('text-muted')
  })
})
