'use client'

import { forwardRef, useTransition } from 'react'
import type { ComponentProps, MouseEvent } from 'react'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'
import { useRegisterViewTransition } from './ViewTransitionResolver'

// Safety-net delay before a pending view transition resolves itself, for
// navigations the route watcher can't see settle (e.g. a link back to the
// current URL) — see build-history/63-view-transition-page-crossfade.md.
const VIEW_TRANSITION_FALLBACK_MS = 1500

// Three link roles — see components.md §12 and build-history.md step 21 for
// the audit behind them. Wraps next/link's Link (not a plain <a>) so
// client-side navigation is never lost by accident. Layout classes that
// differ per call site (e.g. card's `block` vs `flex items-center
// justify-between`) are NOT part of a variant — pass them via className.
//
// `transition active:opacity-60` on the shared base is the zero-latency tap
// feedback (fires on :active before any JS runs); `card`'s own
// `transition-colors` was dropped as redundant since the base `transition`
// utility already covers color/background/opacity.
export const linkVariants = cva('transition active:opacity-60', {
  variants: {
    variant: {
      nav: 'text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100',
      card: 'rounded border border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800',
      inline: 'text-blue-600 hover:underline',
    },
    // Only meaningful for variant="inline" (see compoundVariants below) — a
    // plain className size override wouldn't reliably win against the
    // variant's own text-sm since cn()/clsx doesn't dedupe conflicting
    // Tailwind utilities the way tailwind-merge would.
    size: {
      standard: '',
      compact: '',
    },
  },
  compoundVariants: [
    { variant: 'inline', size: 'standard', class: 'text-sm' },
    { variant: 'inline', size: 'compact', class: 'text-xs' },
  ],
  defaultVariants: {
    variant: 'inline',
    size: 'standard',
  },
})

type LinkProps = ComponentProps<typeof NextLink> &
  VariantProps<typeof linkVariants>

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  function Link(
    { className, variant, size, href, target, onClick, ...props },
    ref,
  ) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const registerViewTransition = useRegisterViewTransition()

    // No native useLinkStatus here — this project is pinned to React 18
    // (see build history), and useLinkStatus calls React 19's
    // useOptimistic internally. useTransition + router.push is the
    // documented pre-useLinkStatus pattern for tracking navigation pending
    // state, and works the same way on React 18.
    function handleClick(event: MouseEvent<HTMLAnchorElement>) {
      onClick?.(event)
      if (
        event.defaultPrevented ||
        typeof href !== 'string' ||
        !href.startsWith('/') ||
        target === '_blank' ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return
      }
      event.preventDefault()

      // Browser-native crossfade between the outgoing page and the
      // loading.tsx skeleton, instead of the hard cut. Falls back silently
      // where unsupported (Firefox, older Safari). The resolve is handed to
      // the root-level ViewTransitionResolverProvider rather than tracked
      // locally — this Link itself is often the thing that unmounts when
      // the navigation it triggered completes (e.g. a card link into the
      // page it's replacing), so local state would never get to fire it.
      if (
        typeof document.startViewTransition === 'function' &&
        registerViewTransition
      ) {
        document.startViewTransition(
          () =>
            new Promise<void>((resolve) => {
              let settled = false
              const finish = () => {
                if (settled) return
                settled = true
                resolve()
              }
              // Safety net so a stalled transition can't reach the
              // browser's own timeout/rejection.
              const fallback = setTimeout(finish, VIEW_TRANSITION_FALLBACK_MS)
              registerViewTransition(() => {
                clearTimeout(fallback)
                finish()
              })
              startTransition(() => {
                router.push(href)
              })
            }),
        )
      } else {
        startTransition(() => {
          router.push(href)
        })
      }
    }

    return (
      <NextLink
        ref={ref}
        href={href}
        target={target}
        onClick={handleClick}
        aria-busy={isPending || undefined}
        className={cn(
          linkVariants({ variant, size }),
          isPending && 'opacity-60 pointer-events-none',
          className,
        )}
        {...props}
      />
    )
  },
)
