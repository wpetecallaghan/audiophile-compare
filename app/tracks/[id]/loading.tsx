import { PageLoading } from '@/components/ui/PageLoading'

export default function Loading() {
  // hasFooterNav: exact here — navBackHref is always '/tracks' on this
  // page (single origin list, unlike tests/[id]), so its footer nav
  // renders unconditionally. See components.md §14.
  return <PageLoading maxWidth="4xl" hasFooterNav />
}
