import { forwardRef } from 'react'
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// Shared by TextInput, TextArea, and Select below — all three render the
// same visual field regardless of element type. Exported so a non-field
// element could reuse it, same reason buttonVariants/linkVariants are
// exported. Two size tiers found in real usage; a third pattern (missing
// border-gray-200 + no focus ring) was a bug, not a tier — see
// build-history.md step 22.
export const fieldVariants = cva(
  'w-full rounded border border-border dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-blue-500',
  {
    variants: {
      size: {
        standard: 'px-3 py-2 text-sm focus:ring-2',
        compact: 'px-2 py-1 text-xs focus:ring-1',
      },
    },
    defaultVariants: {
      size: 'standard',
    },
  },
)

type FieldVariants = VariantProps<typeof fieldVariants>

// `size` is also a native HTML attribute on <input> (character width) and
// <select> (visible option count) — omit it so our cva variant prop doesn't
// collide with the native numeric one.
type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & FieldVariants

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  function TextInput({ className, size, ...props }, ref) {
    return (
      <input ref={ref} className={cn(fieldVariants({ size }), className)} {...props} />
    )
  },
)

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldVariants

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea({ className, size, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(fieldVariants({ size }), 'resize-none', className)}
        {...props}
      />
    )
  },
)

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & FieldVariants

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ className, size, ...props }, ref) {
    return (
      <select ref={ref} className={cn(fieldVariants({ size }), className)} {...props} />
    )
  },
)
