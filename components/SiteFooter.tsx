import { FooterPrivacyLinks } from '@/components/ui/FooterPrivacyLinks'
import { FOOTER_NAV_SLOT_ID } from '@/components/ui/footer-nav-slot'

export default function SiteFooter() {
  return (
    <footer className="shrink-0 border-t border-gray-100 dark:border-gray-800">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 min-h-14 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-x-4 gap-y-1 py-2">
        <FooterPrivacyLinks />
        {/* Page-specific step-through nav (feed pagination, test detail
            First/Previous/Next/Last/All) portals its content in here via
            FooterPortal, so it's always visible without scrolling. Empty
            on pages that don't use it — collapses to zero height then, so
            this row is invisible when there's nothing to show. flex-col
            above (on the parent) gives this its own row on narrow
            viewports unconditionally, rather than sometimes wrapping there
            depending on how many controls happen to render (e.g. feed
            page 1 fits alongside Privacy/Terms but page 2's extra
            First/Previous controls don't) — the footer's height now stays
            constant across pagination states instead of visibly jumping. */}
        <div id={FOOTER_NAV_SLOT_ID} className="flex items-center justify-center sm:justify-end gap-3" />
      </div>
    </footer>
  )
}
