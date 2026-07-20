// A labeled horizontal rule — "or register with email" style separators.
// Catalogued in step 52, built now alongside AuthShell for the same reason
// (a third caller, app/forgot-password/page.tsx's sibling app/login/page.tsx,
// would otherwise hand-copy this a second time).
export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
    </div>
  )
}
