import type { ReactNode } from 'react'
import { Heading } from './Heading'
import { Text } from './Text'

// Title (+ optional eyebrow label, subtitle, and trailing actions) block —
// the <div className="space-y-1"> header repeated across app/page.tsx,
// app/profile/page.tsx, app/systems/[id]/page.tsx, and both admin pages
// before this component existed (build step 52). `children` is for any
// extra meta content below the subtitle (e.g. a snapshot count line).
type PageHeaderProps = {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

export function PageHeader({ eyebrow, title, subtitle, actions, children }: PageHeaderProps) {
  return (
    <div className="space-y-1">
      {eyebrow && (
        <Text size="xs" className="font-semibold uppercase tracking-wide">
          {eyebrow}
        </Text>
      )}
      <div className="flex items-start justify-between gap-4">
        <Heading level={1}>{title}</Heading>
        {actions && <div className="shrink-0 flex gap-3">{actions}</div>}
      </div>
      {subtitle && <Text>{subtitle}</Text>}
      {children}
    </div>
  )
}
