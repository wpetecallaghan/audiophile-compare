import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// Alert/info boxes, keyed to meaning. `info` previously had no dark-mode
// classes at all (MappingBadge.tsx) — a real bug fixed by consolidating
// here, same class of bug as step 20's unpaired colors. Padding is
// deliberately not part of the variant — pass it via className, same
// reasoning as Link's `card` variant (TallyDisplay.tsx uses a tighter
// px-3 py-2.5 than the p-4 default). See build-history.md step 22.
const calloutVariants = cva('rounded border p-4', {
  variants: {
    tone: {
      warning: 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20',
      success: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20',
      info: 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20',
      neutral: 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800',
    },
  },
})

type CalloutProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof calloutVariants> & {
    tone: 'warning' | 'success' | 'info' | 'neutral'
  }

export function Callout({ tone, className, ...props }: CalloutProps) {
  return (
    <div className={cn(calloutVariants({ tone }), className)} {...props} />
  )
}
