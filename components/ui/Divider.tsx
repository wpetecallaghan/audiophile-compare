// A labeled horizontal rule — "or register with email" style separators.
// Catalogued in step 52, built now alongside AuthShell for the same reason
// (a third caller, app/forgot-password/page.tsx's sibling app/login/page.tsx,
// would otherwise hand-copy this a second time).
export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 border-t border-border" />
      <span className="text-xs text-muted">{label}</span>
      <div className="flex-1 border-t border-border" />
    </div>
  )
}
