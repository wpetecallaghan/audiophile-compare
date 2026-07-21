import type { ReactNode } from 'react'

// Shared "Clip A"/"Clip B" slot heading — identical in ABPlayer and its own
// loading-fallback (app/tests/[id]/page.tsx's ClipSlotFallback).
export function ClipLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wide">{children}</h2>
}
