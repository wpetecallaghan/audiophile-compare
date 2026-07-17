import { PageLoading } from '@/components/ui/PageLoading'

export default function Loading() {
  // hasFooterNav: an approximation, not exact — this route's nav is only
  // shown when reached with a valid `from` context (feed/track/system),
  // which isn't known until the real page's data resolves. The common
  // case (arriving from a list) has it; accepting a mismatch in the rarer
  // direct-link case is a better tradeoff than never hiding Privacy/Terms
  // during loading at all. See components.md §14.
  return <PageLoading maxWidth="4xl" spacing="responsive" hasFooterNav />
}
