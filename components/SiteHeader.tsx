import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import SignOutButton from './SignOutButton'

export default async function SiteHeader() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="border-b border-gray-100">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">

        <Link
          href="/"
          className="text-sm font-semibold tracking-tight shrink-0 hover:text-gray-600"
        >
          Audiophile Compare
        </Link>

        {user ? (
          <nav className="flex items-center gap-4 sm:gap-6">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
              Tests
            </Link>
            <Link href="/systems" className="text-sm text-gray-500 hover:text-gray-900">
              Systems
            </Link>
            <Link href="/tracks" className="text-sm text-gray-500 hover:text-gray-900">
              Tracks
            </Link>
            <Link href="/profile" className="text-sm text-gray-500 hover:text-gray-900">
              Profile
            </Link>
            <SignOutButton />
          </nav>
        ) : (
          <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900">
            Sign in
          </Link>
        )}

      </div>
    </header>
  )
}
