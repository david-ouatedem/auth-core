'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@authcore/nextjs/client'

export default function MagicLinkPage() {
  const { signInWithMagicLink } = useAuth()
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const email = String(new FormData(e.currentTarget).get('email'))
    try {
      await signInWithMagicLink(email)
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <h1>Magic-link sign-in</h1>
      <div className="card">
        {sent ? (
          <>
            <p className="success">Check your email for a sign-in link.</p>
            <p className="muted">
              No email provider configured? In dev, the link is printed to the server console
              (look at your <code>pnpm dev</code> terminal). Click it to land on /dashboard with
              an active session.
            </p>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" autoFocus />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        )}
        <p className="muted" style={{ marginTop: '1rem' }}>
          <Link href="/login">Use password instead</Link>
        </p>
      </div>
    </main>
  )
}
