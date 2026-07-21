import type { HTMLAttributes, ElementType } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

// Muted caption text (subheadings, dates, empty-states, metadata) and
// body-copy paragraphs (long-form prose on about/privacy/terms) — the
// single most-repeated raw className pattern found in the build step 52
// audit, ~60+ occurrences across nearly every page. className passthrough
// covers per-site modifiers (truncate, italic, mt-*, shrink-0) the same
// way Badge/Heading already allow.
const textVariants = cva('', {
  variants: {
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
    },
    tone: {
      muted: 'text-muted',
      body: 'text-body',
    },
  },
  defaultVariants: {
    size: 'sm',
    tone: 'muted',
  },
})

type TextProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof textVariants> & {
    as?: 'p' | 'span'
  }

export function Text({ as, size, tone, className, ...props }: TextProps) {
  const Tag = (as ?? 'p') as ElementType
  return (
    <Tag className={cn(textVariants({ size, tone }), className)} {...props} />
  )
}
