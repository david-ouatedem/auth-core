'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@authcore/nextjs/client'

interface PendingChallenge {
  challengeToken: string
  email: string
}

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter()
  const next = useSearchParams().get('next') ?? '/dashboard'
  const { signIn, signInWithProvider, verifyTwoFactor, useRecoveryCode } = useAuth()

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<PendingChallenge | null>(null)
  const [useRecovery, setUseRecovery] = useState(false)

  // Step 1: password — may return either a full session OR a 2FA challenge.
  async function onPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email'))
    try {
      const result = await signIn(email, String(form.get('password')))
      if ('requires2FA' in result) {
        setPending({ challengeToken: result.challengeToken, email })
      } else {
        router.push(next)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  // Step 2 (only if 2FA enabled for this user): TOTP code OR recovery code.
  async function onChallengeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const code = String(new FormData(e.currentTarget).get('code'))
    try {
      if (useRecovery) {
        await useRecoveryCode(pending!.challengeToken, code)
      } else {
        await verifyTwoFactor(pending!.challengeToken, code)
      }
      router.push(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  if (pending) {
    return (
      <form onSubmit={onChallengeSubmit}>
        <p className="muted">
          {useRecovery
            ? 'Enter one of your single-use recovery codes:'
            : `Enter the 6-digit code from your authenticator for ${pending.email}:`}
        </p>
        {error && <p className="error">{error}</p>}
        <input
          name="code"
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder={useRecovery ? 'XXXX-XXXX-XXXX' : '123456'}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Verifying…' : 'Verify'}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setUseRecovery(!useRecovery)
            setError(null)
          }}
        >
          {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
        </button>
      </form>
    )
  }

  return (
    <>
      <form onSubmit={onPasswordSubmit}>
        {error && <p className="error">{error}</p>}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" autoFocus />
        </label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {googleEnabled && (
        <>
          <div className="divider">or</div>
          <button
            type="button"
            className="secondary"
            onClick={() => signInWithProvider('google')}
          >
            Sign in with Google
          </button>
        </>
      )}

      <p className="muted" style={{ marginTop: '1rem' }}>
        <Link href="/magic-link">Email me a sign-in link instead</Link> · <Link href="/signup">Create account</Link>
      </p>
    </>
  )
}
