import LoginForm from '@/components/LoginForm'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string }
}) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <LoginForm redirectTo={searchParams.redirectTo} />
      </div>
    </main>
  )
}