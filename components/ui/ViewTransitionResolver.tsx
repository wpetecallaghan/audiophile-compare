'use client'

import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

type RegisterResolve = (resolve: () => void) => void

const ViewTransitionResolverContext = createContext<RegisterResolve | null>(
  null,
)

// Mounted once at the root layout (unlike an individual Link, which can
// unmount mid-navigation when the page it lives on gets replaced) so the
// registered resolve always survives long enough to fire. Split into its
// own leaf component so only this piece — not the whole app — opts into
// the client-side rendering that useSearchParams requires.
function RouteWatcher({ onRouteSettled }: { onRouteSettled: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const routeKey = `${pathname}?${searchParams.toString()}`

  useEffect(() => {
    onRouteSettled()
    // Only the settled route identity should retrigger this — onRouteSettled
    // is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey])

  return null
}

export function ViewTransitionResolverProvider({
  children,
}: {
  children: ReactNode
}) {
  const resolveRef = useRef<(() => void) | null>(null)

  function register(resolve: () => void) {
    resolveRef.current = resolve
  }

  function handleRouteSettled() {
    resolveRef.current?.()
    resolveRef.current = null
  }

  return (
    <ViewTransitionResolverContext.Provider value={register}>
      <Suspense fallback={null}>
        <RouteWatcher onRouteSettled={handleRouteSettled} />
      </Suspense>
      {children}
    </ViewTransitionResolverContext.Provider>
  )
}

export function useRegisterViewTransition() {
  return useContext(ViewTransitionResolverContext)
}
