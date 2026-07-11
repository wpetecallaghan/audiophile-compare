import type { ReactNode } from 'react'
import { Link } from './Link'

// The recurring list-item card: a title + optional subtitle block on the
// left, optional trailing content (a badge, a date, a count) on the
// right. Found independently duplicated (with small unintentional
// divergences — items-start vs items-center, ml-4 vs gap-4, presence/
// absence of truncate) in FeedCard.tsx, systems/page.tsx,
// systems/[id]/page.tsx, tracks/page.tsx, and tracks/[id]/page.tsx before
// this component existed (build step 52) — those divergences are
// resolved onto one canonical layout here, same as step 22 converged
// FieldLabel's three disagreeing muted-label variants onto one.
//
// items-start (not items-center) is the canonical choice — confirmed via
// a real side-by-side visual diff against staging after an initial
// items-center pass: FeedCard's badge visibly centering against its
// multi-line subtitle block was the one non-neutral visual change out of
// the whole step, so items-start (FeedCard's and systems/page.tsx's
// original alignment) was chosen as canonical instead, even though it
// means systems/[id]/page.tsx and both tracks pages (originally
// items-center) shift instead — the trade-off was made deliberately,
// not rediscovered by accident a second time.
type RowCardProps = {
  href: string
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
}

export function RowCard({ href, title, subtitle, trailing }: RowCardProps) {
  return (
    <li>
      <Link href={href} variant="card" className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium truncate">{title}</p>
          {subtitle}
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </Link>
    </li>
  )
}
