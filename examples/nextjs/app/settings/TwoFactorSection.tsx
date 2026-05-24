'use client'
import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '@authcore/nextjs/client'

type SetupResult = { secret: string; otpauthUrl: string; recoveryCodes: string[] }

export function TwoFactorSection({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const { setupTwoFactor, enableTwoFactor, disableTwoFactor } = useAuth()
  const [enabled, setEnabled] = useState(initiallyEnabled)
  const [setup, setSetup] = useState<SetupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSetup() {
    setLoading(true)
    setError(null)
    try {
      setSetup(await setupTwoFactor())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  async function onConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const code = String(new FormData(e.currentTarget).get('code'))
    try {
      await enableTwoFactor(code)
      setEnabled(true)
      // Keep `setup` visible so user can still see recovery codes if they haven't copied yet
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code — try again')
    } finally {
      setLoading(false)
    }
  }

  async function onDisable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const password = String(new FormData(e.currentTarget).get('password'))
    try {
      await disableTwoFactor(password)
      setEnabled(false)
      setSetup(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable 2FA')
    } finally {
      setLoading(false)
    }
  }

  // --- ENABLED state ---
  if (enabled && !setup) {
    return (
      <>
        <p className="success">Two-factor is enabled on this account.</p>
        <form onSubmit={onDisable}>
          <p className="muted">To disable, confirm your password:</p>
          {error && <p className="error">{error}</p>}
          <input name="password" type="password" required autoComplete="current-password" />
          <button type="submit" disabled={loading}>
            {loading ? 'Disabling…' : 'Disable 2FA'}
          </button>
        </form>
      </>
    )
  }

  // --- ENROLLMENT in progress (have a setup response, awaiting confirmation) ---
  if (setup) {
    return (
      <>
        {enabled ? (
          <p className="success">Enabled. Save the recovery codes below before navigating away.</p>
        ) : (
          <p>Scan this QR with your authenticator app, then enter the first code below.</p>
        )}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '1rem 0' }}>
          <div style={{ background: 'white', padding: '0.75rem', borderRadius: '8px' }}>
            <QRCodeSVG value={setup.otpauthUrl} size={180} />
          </div>
        </div>
        <details>
          <summary className="muted" style={{ cursor: 'pointer' }}>Can&apos;t scan? Show secret</summary>
          <pre>{setup.secret}</pre>
        </details>
        <h2>Recovery codes (one-time)</h2>
        <p className="muted">
          Store these somewhere safe. Each works once. Lost devices recover via these codes.
        </p>
        <pre>{setup.recoveryCodes.join('\n')}</pre>

        {!enabled && (
          <form onSubmit={onConfirm}>
            {error && <p className="error">{error}</p>}
            <label>
              Authenticator code
              <input name="code" autoComplete="one-time-code" required autoFocus placeholder="123456" />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Confirming…' : 'Enable 2FA'}
            </button>
          </form>
        )}
      </>
    )
  }

  // --- DISABLED state ---
  return (
    <>
      <p className="muted">
        Add an authenticator app (Google Authenticator, 1Password, Authy, Bitwarden…) as a
        second factor on top of your password.
      </p>
      {error && <p className="error">{error}</p>}
      <button onClick={onSetup} disabled={loading}>
        {loading ? 'Starting…' : 'Set up 2FA'}
      </button>
    </>
  )
}
