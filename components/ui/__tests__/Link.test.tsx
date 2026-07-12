import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link } from '../Link'

// --- Mocks ---

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Full prop passthrough (unlike other test files' next/link mocks) — this
// suite exercises Link.tsx's own click-interception logic, which is passed
// to NextLink as onClick/target/aria-busy/className and must reach the
// rendered anchor to be triggered by userEvent.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    onClick,
    target,
    'aria-busy': ariaBusy,
  }: {
    href: string
    children: React.ReactNode
    className?: string
    onClick?: React.MouseEventHandler<HTMLAnchorElement>
    target?: string
    'aria-busy'?: boolean
  }) => (
    <a
      href={href}
      className={className}
      onClick={onClick}
      target={target}
      aria-busy={ariaBusy}
    >
      {children}
    </a>
  ),
}))

// --- Fixtures ---

// Repeated across most cases below for the same reason — an arbitrary
// internal href/label pair that should be intercepted by default; see
// repeated-string-constants.md.
const INTERNAL_HREF = '/systems'
const LINK_TEXT = 'Systems'

// --- Tests ---

describe('Link', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  it('intercepts a plain click on an internal href and pushes via the router', async () => {
    const user = userEvent.setup()
    render(<Link href={INTERNAL_HREF}>{LINK_TEXT}</Link>)

    await user.click(screen.getByRole('link', { name: LINK_TEXT }))

    expect(mockPush).toHaveBeenCalledWith(INTERNAL_HREF)
  })

  it('does not intercept a cmd/ctrl/shift/alt-click', () => {
    // fireEvent (not userEvent) here — userEvent's click() doesn't reliably
    // forward modifier-key eventInit through to the synthetic event.
    render(<Link href={INTERNAL_HREF}>{LINK_TEXT}</Link>)
    const link = screen.getByRole('link', { name: LINK_TEXT })

    fireEvent.click(link, { ctrlKey: true })
    fireEvent.click(link, { metaKey: true })
    fireEvent.click(link, { shiftKey: true })
    fireEvent.click(link, { altKey: true })

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('does not intercept a middle-click', async () => {
    const user = userEvent.setup()
    render(<Link href={INTERNAL_HREF}>{LINK_TEXT}</Link>)

    await user.pointer({
      keys: '[MouseMiddle]',
      target: screen.getByRole('link', { name: LINK_TEXT }),
    })

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('does not intercept a target="_blank" link', async () => {
    const user = userEvent.setup()
    render(
      <Link href="https://forum.example.com/thread" target="_blank">
        View original post
      </Link>,
    )

    await user.click(screen.getByRole('link', { name: 'View original post' }))

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('does not intercept a non-internal href', async () => {
    const user = userEvent.setup()
    render(<Link href="https://example.com">External</Link>)

    await user.click(screen.getByRole('link', { name: 'External' }))

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('still calls a caller-supplied onClick, which can veto interception via preventDefault', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault())
    render(
      <Link href={INTERNAL_HREF} onClick={onClick}>
        {LINK_TEXT}
      </Link>,
    )

    await user.click(screen.getByRole('link', { name: LINK_TEXT }))

    expect(onClick).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('is not aria-busy before any navigation is triggered', () => {
    render(<Link href={INTERNAL_HREF}>{LINK_TEXT}</Link>)

    expect(
      screen.getByRole('link', { name: LINK_TEXT }),
    ).not.toHaveAttribute('aria-busy')
  })
})
