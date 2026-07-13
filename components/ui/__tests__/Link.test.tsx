import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link } from '../Link'
import { useRegisterViewTransition } from '../ViewTransitionResolver'

// --- Mocks ---

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Real logic lives in ViewTransitionResolver.test.tsx — here it's mocked so
// each test controls whether a resolver is "available" independently of
// document.startViewTransition support.
vi.mock('../ViewTransitionResolver', () => ({
  useRegisterViewTransition: vi.fn(),
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
    // Default: no resolver available, matching "no ViewTransitionResolverProvider
    // in the tree" — every test in this file except the "view transition
    // crossfade" block below exercises the plain-navigation fallback.
    vi.mocked(useRegisterViewTransition).mockReturnValue(null)
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

describe('Link — view transition crossfade', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  afterEach(() => {
    // jsdom has no native startViewTransition — remove whatever a test
    // stubbed onto document so it doesn't leak into a later test.
    delete (document as { startViewTransition?: unknown }).startViewTransition
    vi.useRealTimers()
  })

  it('starts a view transition and registers a resolve callback when supported and a resolver is available', async () => {
    const registerViewTransition = vi.fn()
    vi.mocked(useRegisterViewTransition).mockReturnValue(
      registerViewTransition,
    )
    const startViewTransition = vi.fn((callback: () => Promise<void>) => {
      callback()
    })
    document.startViewTransition =
      startViewTransition as unknown as typeof document.startViewTransition

    const user = userEvent.setup()
    render(<Link href={INTERNAL_HREF}>{LINK_TEXT}</Link>)
    await user.click(screen.getByRole('link', { name: LINK_TEXT }))

    expect(startViewTransition).toHaveBeenCalledTimes(1)
    expect(registerViewTransition).toHaveBeenCalledWith(
      expect.any(Function),
    )
    expect(mockPush).toHaveBeenCalledWith(INTERNAL_HREF)
  })

  it('falls back to a plain navigation when startViewTransition is unsupported', async () => {
    vi.mocked(useRegisterViewTransition).mockReturnValue(vi.fn())
    // No document.startViewTransition stubbed — matches real jsdom/Firefox.

    const user = userEvent.setup()
    render(<Link href={INTERNAL_HREF}>{LINK_TEXT}</Link>)
    await user.click(screen.getByRole('link', { name: LINK_TEXT }))

    expect(mockPush).toHaveBeenCalledWith(INTERNAL_HREF)
  })

  it('falls back to a plain navigation when no resolver is available', async () => {
    vi.mocked(useRegisterViewTransition).mockReturnValue(null)
    const startViewTransition = vi.fn()
    document.startViewTransition =
      startViewTransition as unknown as typeof document.startViewTransition

    const user = userEvent.setup()
    render(<Link href={INTERNAL_HREF}>{LINK_TEXT}</Link>)
    await user.click(screen.getByRole('link', { name: LINK_TEXT }))

    expect(startViewTransition).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith(INTERNAL_HREF)
  })

  it('resolves the transition on its own via the fallback timer if the registered resolve never fires', async () => {
    // Duplicated from Link.tsx's own VIEW_TRANSITION_FALLBACK_MS rather than
    // imported (it's not exported) — same local-duplication precedent as
    // GoogleDrivePlayer.test.tsx's own POLL_MS.
    const VIEW_TRANSITION_FALLBACK_MS = 1500

    vi.useFakeTimers()
    let registeredResolve: (() => void) | undefined
    vi.mocked(useRegisterViewTransition).mockReturnValue((resolve) => {
      registeredResolve = resolve
    })
    let capturedPromise: Promise<void> | undefined
    const startViewTransition = vi.fn((callback: () => Promise<void>) => {
      capturedPromise = callback()
    })
    document.startViewTransition =
      startViewTransition as unknown as typeof document.startViewTransition

    render(<Link href={INTERNAL_HREF}>{LINK_TEXT}</Link>)
    fireEvent.click(screen.getByRole('link', { name: LINK_TEXT }))

    act(() => {
      vi.advanceTimersByTime(VIEW_TRANSITION_FALLBACK_MS)
    })

    await expect(capturedPromise).resolves.toBeUndefined()
    // Calling the registered resolve after the fallback already fired must
    // not throw (the `settled` guard inside Link.tsx).
    expect(() => registeredResolve?.()).not.toThrow()
  })
})
