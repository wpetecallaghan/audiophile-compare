import { Link } from './Link'

type Props = {
  href: string
  'aria-label': string
  children: React.ReactNode // the icon
}

// Wraps Link variant="nav" for the footer's icon-only step-through controls
// (First/Previous/All/Next/Last — tests/[id], tracks/[id], and the feed's
// own pagination). A bare 16px icon with no padding is only a ~16x16px tap
// target — this grows the actual hit area to 44x44 (iOS HIG / WCAG 2.5.5's
// minimum) via padding around the same visually unchanged icon, plus a
// rounded hover fill so the tappable region is visible, not just bigger
// (build step 68).
export function FooterNavLink({ href, 'aria-label': ariaLabel, children }: Props) {
  return (
    <Link
      href={href}
      variant="nav"
      aria-label={ariaLabel}
      className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      {children}
    </Link>
  )
}
