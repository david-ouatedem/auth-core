import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'

export default async function Home() {
  const user = await getCurrentUser()
  return (
    <main>
      <h1>AuthCore example</h1>
      <p className="muted">
        Email/password, magic-link, Google OAuth, and TOTP 2FA — all wired through a single Next.js
        catch-all route handler.
      </p>

      <div className="card">
        {user ? (
          <>
            <p>
              Signed in as <strong>{user.email}</strong>
              {user.twoFactorEnabled && ' · 2FA on'}
            </p>
            <Link href="/dashboard">
              <button>Go to dashboard</button>
            </Link>
          </>
        ) : (
          <>
            <Link href="/login">
              <button>Sign in</button>
            </Link>
            <Link href="/signup">
              <button className="secondary">Create account</button>
            </Link>
            <Link href="/magic-link">
              <button className="secondary">Magic-link sign-in</button>
            </Link>
          </>
        )}
      </div>

      <p className="muted">
        Source: <a href="https://github.com/david-ouatedem/auth-core/tree/main/examples/nextjs">examples/nextjs</a>
      </p>
    </main>
  )
}
