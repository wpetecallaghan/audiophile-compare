import { Link } from './Link'

type Props = {
  // null means "this control has no destination at the current position"
  // (e.g. Previous when already at the first item) — build step 77.
  // Callers always render FooterNavLink; it decides enabled vs. disabled
  // itself, rather than the caller omitting the control from the DOM
  // entirely. See the disabled branch below for why.
  href: string | null
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
  // Real bug fixed in step 77: callers used to omit this control from the
  // DOM entirely at a boundary (no href to give it), which left every
  // other control in the row to reflow into the gap — the whole
  // First/Previous/Next/Last cluster visibly jumped position crossing the
  // first/second or last/second-to-last item, making rapid step-through
  // clicking land on the wrong control. Always rendering a same-sized
  // disabled button in that slot instead keeps every control's position
  // fixed regardless of where you are in the list, and doubles as a clear
  // "you're at this boundary" signal rather than a silent gap.
  //
  // Real follow-up bug, reported directly: the first version only applied
  // disabled:opacity-40 (this codebase's existing dimming convention from
  // Button.tsx/ConfirmButton.tsx) with no explicit base text color, so the
  // button inherited the page's near-black/near-white body foreground
  // (app/globals.css's --foreground) instead of the enabled Link's own
  // muted gray. Button.tsx's own buttons have a strong solid
  // background/text color for opacity-40 to dim, but this icon-only
  // button has neither, so the same convention alone barely moved the
  // needle: 40% of near-black/near-white composites to a similarly-toned
  // mid-gray as the enabled control's un-dimmed gray-500/gray-400, in
  // both themes — a real, direct cause of "can't tell disabled from
  // enabled at a glance." Fixed by explicitly starting from the exact
  // same `text-gray-500 dark:text-gray-400` the enabled Link below uses,
  // *then* dimming that — so disabled reads as "this same control, grayed
  // out," not a different, coincidentally-similar tone.
  if (href === null) {
    return (
      <button
        type="button"
        disabled
        aria-label={ariaLabel}
        className="flex items-center justify-center w-11 h-11 rounded-full text-gray-500 dark:text-gray-400 disabled:opacity-40"
      >
        {children}
      </button>
    )
  }

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
