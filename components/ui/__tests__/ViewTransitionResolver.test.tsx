import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import {
  ViewTransitionResolverProvider,
  useRegisterViewTransition,
} from '../ViewTransitionResolver'

// --- Mocks ---

// Mutable so each test can simulate a route change between renders by
// reassigning these and calling `rerender`.
let mockPathname = '/tests/1'
let mockSearchParams = new URLSearchParams('from=feed&page=1')

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}))

// --- Test helper ---

type RegisterFn = ReturnType<typeof useRegisterViewTransition>

// Captures the current register function into an external holder so tests
// can call it directly — the value itself (not a callback into it) is all
// any test needs, so a plain render-time assignment is enough here.
function Consumer({ holder }: { holder: { current: RegisterFn } }) {
  holder.current = useRegisterViewTransition()
  return null
}

// --- Tests ---

describe('ViewTransitionResolverProvider / useRegisterViewTransition', () => {
  beforeEach(() => {
    mockPathname = '/tests/1'
    mockSearchParams = new URLSearchParams('from=feed&page=1')
  })

  it('returns null outside a provider, so callers can fall back to plain navigation', () => {
    const holder: { current: RegisterFn } = { current: null }
    render(<Consumer holder={holder} />)

    expect(holder.current).toBeNull()
  })

  it('resolves the registered callback once the pathname changes', () => {
    const holder: { current: RegisterFn } = { current: null }
    const { rerender } = render(
      <ViewTransitionResolverProvider>
        <Consumer holder={holder} />
      </ViewTransitionResolverProvider>,
    )
    const resolve = vi.fn()
    holder.current?.(resolve)

    mockPathname = '/tests/2'
    rerender(
      <ViewTransitionResolverProvider>
        <Consumer holder={holder} />
      </ViewTransitionResolverProvider>,
    )

    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('does not resolve on a rerender with an unchanged pathname and searchParams', () => {
    const holder: { current: RegisterFn } = { current: null }
    const { rerender } = render(
      <ViewTransitionResolverProvider>
        <Consumer holder={holder} />
      </ViewTransitionResolverProvider>,
    )
    const resolve = vi.fn()
    holder.current?.(resolve)

    // Same pathname/searchParams values — a rerender for an unrelated
    // reason must not spuriously fire the registered resolve.
    rerender(
      <ViewTransitionResolverProvider>
        <Consumer holder={holder} />
      </ViewTransitionResolverProvider>,
    )

    expect(resolve).not.toHaveBeenCalled()
  })

  it('resolves on a searchParams-only change (same pathname) — the app\'s own ?from=feed&page=1-style navigations', () => {
    const holder: { current: RegisterFn } = { current: null }
    const { rerender } = render(
      <ViewTransitionResolverProvider>
        <Consumer holder={holder} />
      </ViewTransitionResolverProvider>,
    )
    const resolve = vi.fn()
    holder.current?.(resolve)

    mockSearchParams = new URLSearchParams('from=feed&page=2')
    rerender(
      <ViewTransitionResolverProvider>
        <Consumer holder={holder} />
      </ViewTransitionResolverProvider>,
    )

    expect(resolve).toHaveBeenCalledTimes(1)
  })
})
