'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FOOTER_NAV_SLOT_ID } from './footer-nav-slot'

// Renders children into the global SiteFooter's nav slot instead of inline
// in the page — so page-stepping controls stay visible without scrolling,
// since SiteFooter (app/layout.tsx) sits outside the scrollable content
// area. The slot only exists once SiteFooter has mounted, hence the
// useEffect lookup rather than reading document at render time.
export function FooterPortal({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setTarget(document.getElementById(FOOTER_NAV_SLOT_ID))
  }, [])

  if (!target) return null
  return createPortal(children, target)
}
