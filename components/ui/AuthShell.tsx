import type { ReactNode } from 'react'
import { Heading } from './Heading'

// The centered-card shell shared by /login, /register, /forgot-password —
// catalogued but deliberately left unbuilt in step 52 (only 2 occurrences
// at the time); built now that a third page needs the same shell. Unlike
// PageShell, no variants — nothing to wrap in cva.
export function AuthShell({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <main className="h-full flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <Heading level={1}>{heading}</Heading>
        {children}
      </div>
    </main>
  )
}
