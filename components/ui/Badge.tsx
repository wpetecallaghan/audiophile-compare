import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// Canonical status colors — originally defined in outcomeLabel()
// (app/systems/[id]/page.tsx). Add a new status here, not as a one-off
// bg-*/text-* pair at the call site — that's exactly the drift build step 20
// spent an afternoon cleaning up.
const badgeVariants = cva('text-xs px-2 py-0.5 rounded-full', {
  variants: {
    status: {
      win: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
      loss: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
      draw: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
      blind: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      revealed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    },
  },
})

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & {
    status: 'win' | 'loss' | 'draw' | 'blind' | 'revealed'
  }

export function Badge({ status, className, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ status }), className)} {...props} />
  )
}
