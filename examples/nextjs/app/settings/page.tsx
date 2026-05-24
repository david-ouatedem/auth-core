import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { TwoFactorSection } from './TwoFactorSection'

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login?next=/settings')

  return (
    <main>
      <h1>Account settings</h1>
      <div className="card">
        <h2>Two-factor authentication</h2>
        <TwoFactorSection initiallyEnabled={user.twoFactorEnabled} />
      </div>
      <p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
    </main>
  )
}
