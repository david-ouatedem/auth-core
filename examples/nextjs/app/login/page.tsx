import { LoginForm } from './LoginForm'
import { googleOAuthEnabled } from '@/lib/auth'

// LoginForm uses useSearchParams (?next=…) so this page must be dynamic.
// Without this, Next 15 tries to prerender it and bails on the search-params hook.
export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <main>
      <h1>Sign in</h1>
      <div className="card">
        <LoginForm googleEnabled={googleOAuthEnabled} />
      </div>
    </main>
  )
}
