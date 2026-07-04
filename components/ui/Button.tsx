import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// Two roles × two size tiers — see components.md §12 for the full rationale.
// Change a role here and every button using it updates; no more hand-editing
// the same class string in fifteen files. Exported so non-<button> elements
// styled as a button (e.g. a Next.js <Link> acting as "Cancel") can reuse the
// exact same variant classes without wrapping in the Button component.
export const buttonVariants = cva('rounded font-medium disabled:opacity-40', {
  variants: {
    variant: {
      primary:
        'bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200',
      secondary:
        'border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800',
    },
    size: {
      standard: 'px-4 py-2 text-sm',
      compact: 'px-3 py-1.5 text-xs',
    },
  },
  // Secondary buttons use a slightly tighter compact padding than primary's
  // px-3 py-1.5 — matches what was already established across the app for
  // bordered inline actions (edit, cancel, add-snapshot triggers).
  compoundVariants: [
    { variant: 'secondary', size: 'compact', class: 'px-2 py-1' },
  ],
  defaultVariants: {
    variant: 'primary',
    size: 'standard',
  },
})

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  },
)
