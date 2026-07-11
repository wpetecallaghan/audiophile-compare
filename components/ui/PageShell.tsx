import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// The top-level <main> wrapper — identical across every page before this
// component existed (build step 52, mirroring step 22's own Heading/
// FieldLabel/etc. extractions one layer up, at the page-shell level).
const pageShellVariants = cva('container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6', {
  variants: {
    maxWidth: {
      '2xl': 'max-w-2xl',
      '4xl': 'max-w-4xl',
    },
    spacing: {
      normal: 'space-y-6',
      responsive: 'space-y-4 sm:space-y-6',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
})

type PageShellProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof pageShellVariants> & {
    maxWidth: '2xl' | '4xl'
  }

export function PageShell({ maxWidth, spacing, className, ...props }: PageShellProps) {
  return (
    <main className={cn(pageShellVariants({ maxWidth, spacing }), className)} {...props} />
  )
}
