import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// Alert/info boxes, keyed to meaning. `info` previously had no dark-mode
// classes at all (MappingBadge.tsx) — a real bug fixed by consolidating
// here, same class of bug as step 20's unpaired colors. Padding is
// deliberately not part of the variant — pass it via className, same
// reasoning as Link's `card` variant (TallyDisplay.tsx uses a tighter
// px-3 py-2.5 than the p-4 default). See build-history.md step 22.
// warning/info set their own text color since 7 call sites independently
// re-added the identical text-amber-800/text-blue-800 pair on top before
// this was centralized (build step 83) — success/neutral don't have a
// proven second caller doing the same, so they're left text-color-free
// until one shows up (see repeated-string-constants.md's "don't over-apply").
const calloutVariants = cva('rounded border p-4', {
  variants: {
    tone: {
      warning: 'border-warning bg-warning-bg text-warning-foreground',
      success: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20',
      info: 'border-info bg-info-bg text-info-foreground',
      neutral: 'border-border bg-gray-50 dark:bg-gray-800',
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
