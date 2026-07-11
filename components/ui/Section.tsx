import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'
import { Heading } from './Heading'

// <section className="space-y-3"> — 20+ occurrences across about/privacy/
// terms/profile before this component existed (build step 52). Optional
// heading renders a level-2 Heading first, matching the near-universal
// "Heading + body content" pairing at every call site.
type SectionProps = HTMLAttributes<HTMLElement> & {
  heading?: ReactNode
}

export function Section({ heading, children, className, ...props }: SectionProps) {
  return (
    <section className={cn('space-y-3', className)} {...props}>
      {heading && <Heading level={2}>{heading}</Heading>}
      {children}
    </section>
  )
}
