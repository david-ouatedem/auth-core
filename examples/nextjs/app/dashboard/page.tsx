import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { LogoutButton } from './LogoutButton'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/dashboard')

  return (
    <main>
      <h1>Dashboard</h1>
      <div className="card">
        <p>
          Hello <strong>{user.email}</strong>. You signed in successfully.
        </p>
        <pre>{JSON.stringify(user, null, 2)}</pre>
      </div>

      <div className="card">
        <h2>Account</h2>
        <p className="muted">
          Two-factor:{' '}
          {user.twoFactorEnabled ? <strong>on</strong> : <strong>off</strong>}
        </p>
        <Link href="/settings">
          <button className="secondary">Account settings</button>
        </Link>
        <LogoutButton />
      </div>
    </main>
  )
}
