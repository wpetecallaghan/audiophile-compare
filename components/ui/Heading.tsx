import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// One h1 per page, one h2 per page section — exact, unvarying strings
// across every page before this component existed. See build-history.md
// step 22.
const headingVariants = cva('font-semibold', {
  variants: {
    level: {
      1: 'text-xl sm:text-2xl',
      2: 'text-base sm:text-lg',
    },
  },
})

type HeadingProps = HTMLAttributes<HTMLHeadingElement> &
  VariantProps<typeof headingVariants> & {
    level: 1 | 2
  }

export function Heading({ level, className, ...props }: HeadingProps) {
  const Tag = level === 1 ? 'h1' : 'h2'
  return (
    <Tag className={cn(headingVariants({ level }), className)} {...props} />
  )
}
