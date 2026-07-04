import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// Inline error/success text under a form field or action. Standardized on
// text-sm (real usage split text-sm/text-xs with no semantic reason) — see
// build-history.md step 22.
const formMessageVariants = cva('text-sm', {
  variants: {
    tone: {
      error: 'text-red-600 dark:text-red-400',
      success: 'text-green-600 dark:text-green-400',
    },
  },
})

type FormMessageProps = HTMLAttributes<HTMLParagraphElement> &
  VariantProps<typeof formMessageVariants> & {
    tone: 'error' | 'success'
  }

export function FormMessage({ tone, className, ...props }: FormMessageProps) {
  return (
    <p className={cn(formMessageVariants({ tone }), className)} {...props} />
  )
}
