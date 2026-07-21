import type { LabelHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// standard: the label above a normal form field. muted: a smaller,
// de-emphasized label used in dense inline editors (e.g. a two-up
// snapshot picker) — see build-history.md step 22.
const fieldLabelVariants = cva('block', {
  variants: {
    tone: {
      standard: 'text-sm font-medium mb-1',
      muted: 'text-xs text-muted mb-1',
    },
  },
  defaultVariants: {
    tone: 'standard',
  },
})

type FieldLabelProps = LabelHTMLAttributes<HTMLLabelElement> &
  VariantProps<typeof fieldLabelVariants>

export function FieldLabel({ tone, className, ...props }: FieldLabelProps) {
  return (
    <label className={cn(fieldLabelVariants({ tone }), className)} {...props} />
  )
}
