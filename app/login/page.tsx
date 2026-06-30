import LoginForm from '@/components/LoginForm'
import OAuthButtons from '@/components/OAuthButtons'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const params = await searchParams
  
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <OAuthButtons redirectTo={params.redirectTo} />
        <div className="flex items-center gap-3">
          <hr className="flex-1 border-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <hr className="flex-1 border-gray-200" />
        </div>
        <LoginForm redirectTo={params.redirectTo} />
      </div>
    </main>
  )
}