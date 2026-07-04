import { forwardRef } from 'react'
import type { ComponentProps } from 'react'
import NextLink from 'next/link'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// Three link roles — see components.md §12 and build-history.md step 21 for
// the audit behind them. Wraps next/link's Link (not a plain <a>) so
// client-side navigation is never lost by accident. Layout classes that
// differ per call site (e.g. card's `block` vs `flex items-center
// justify-between`) are NOT part of a variant — pass them via className.
export const linkVariants = cva('', {
  variants: {
    variant: {
      nav: 'text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100',
      card: 'rounded border border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
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
  function Link({ className, variant, size, ...props }, ref) {
    return (
      <NextLink
        ref={ref}
        className={cn(linkVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
