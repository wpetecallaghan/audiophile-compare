type IconProps = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function ChevronsLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
    </svg>
  )
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

export function ChevronsRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
    </svg>
  )
}

export function ListIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  )
}
