'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@authcore/nextjs/client'

export default function SignupPage() {
  const router = useRouter()
  const { signUp } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    try {
      await signUp(String(form.get('email')), String(form.get('password')))
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <h1>Create account</h1>
      <div className="card">
        <form onSubmit={onSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password (min 8 chars)
            <input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Sign up'}
          </button>
        </form>
        <p className="muted">
          Already have one? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
