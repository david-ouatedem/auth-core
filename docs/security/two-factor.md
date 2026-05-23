# Two-Factor Authentication (TOTP)

AuthCore 0.12 ships built-in TOTP-based 2FA. Users enroll once with an authenticator app (Google Authenticator, 1Password, Authy, Bitwarden — anything that scans an `otpauth://` URL), and from then on their sign-in flow has two steps:

1. Email + password → AuthCore returns a short-lived **challenge token**.
2. Challenge token + 6-digit code → AuthCore returns a full session.

Plus 10 one-time **recovery codes** issued at enrollment, so a lost device doesn't lock the user out.

## What's implemented

- **RFC 6238 TOTP** (SHA-1, 6 digits, 30-second period). Built from the RFC spec — zero dependencies. Verified against the RFC 6238 Appendix B test vectors.
- **±1 step drift tolerance** (90-second acceptance window), per RFC 6238 §5.2.
- **Recovery codes**: 10 codes per user, `xxxx-xxxx-xxxx` format, SHA-256 hashed at rest, single-use.
- **Disable requires password re-entry** so a stolen session cookie can't silently turn 2FA off.
- **Challenge tokens are scoped JWTs**: they carry `scope: '2fa-pending'` and cannot be reused as session tokens (and vice versa).
- Available on every framework adapter (Express, Fastify, NestJS, Next.js) and the React SDK.

## Enable the feature

2FA is always available on the auth core — there's no `features` flag to set. Users opt in individually by calling `setupTwoFactor`. Set `appName` on your config so authenticator apps show your brand:

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  appName: 'MyApp', // shown in the user's authenticator app
})
```

Make sure to `db:push` (or generate a migration) — Prisma schema now has `twoFactorEnabled` + `twoFactorSecret` columns on `User`, and `RECOVERY_CODE` in the `TokenType` enum.

## HTTP routes

| Method | Path | Auth | Body | Description |
|--------|------|------|------|-------------|
| POST | `/auth/2fa/setup` | required | none | Begin enrollment. Returns `{ secret, otpauthUrl, recoveryCodes }`. |
| POST | `/auth/2fa/enable` | required | `{ code }` | Confirm enrollment with the first TOTP code. |
| POST | `/auth/2fa/disable` | required | `{ password }` | Disable 2FA. Password re-entry required. |
| POST | `/auth/2fa/verify` | none | `{ challengeToken, code }` | Complete a 2FA-pending sign-in with a TOTP code. |
| POST | `/auth/2fa/recovery` | none | `{ challengeToken, code }` | Complete a 2FA-pending sign-in with a recovery code. |

## The login flow changes

`POST /auth/login` now returns one of two shapes:

**Without 2FA** (existing behavior):
```json
{ "user": { ... }, "token": "...", "refreshToken": "..." }
```

**With 2FA enabled** for that user:
```json
{ "requires2FA": true, "challengeToken": "eyJhbGc..." }
```

The challenge token is a JWT with `scope: '2fa-pending'` and a 5-minute TTL. The client checks for `requires2FA` and either prompts for a TOTP code → `/auth/2fa/verify`, or offers the recovery-code flow → `/auth/2fa/recovery`.

## Client integration (React)

```tsx
'use client'
import { useState } from 'react'
import { useAuth } from '@authcore/react'

export function LoginForm() {
  const { signIn, verifyTwoFactor } = useAuth()
  const [pending, setPending] = useState<{ challengeToken: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    const result = await signIn(
      String(formData.get('email')),
      String(formData.get('password')),
    )
    if ('requires2FA' in result) {
      setPending({ challengeToken: result.challengeToken })
    }
    // Otherwise we're signed in — the AuthProvider state updated automatically.
  }

  if (pending) {
    return (
      <form action={async (fd) => {
        try {
          await verifyTwoFactor(pending.challengeToken, String(fd.get('code')))
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Invalid code')
        }
      }}>
        <input name="code" autoComplete="one-time-code" required />
        <button>Verify</button>
        {error && <p>{error}</p>}
      </form>
    )
  }

  return (
    <form action={onSubmit}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button>Sign in</button>
    </form>
  )
}
```

## Enrollment (React)

```tsx
'use client'
import { useState } from 'react'
import { useAuth } from '@authcore/react'
import { QRCodeSVG } from 'qrcode.react'

export function TwoFactorSetup() {
  const { setupTwoFactor, enableTwoFactor } = useAuth()
  const [setup, setSetup] = useState<{ otpauthUrl: string; recoveryCodes: string[] } | null>(null)

  async function begin() {
    setSetup(await setupTwoFactor())
  }

  async function confirm(formData: FormData) {
    await enableTwoFactor(String(formData.get('code')))
    alert('2FA enabled')
  }

  if (!setup) return <button onClick={begin}>Set up 2FA</button>

  return (
    <div>
      <p>Scan this QR with your authenticator app:</p>
      <QRCodeSVG value={setup.otpauthUrl} />
      <p>Save these recovery codes — they're shown once:</p>
      <pre>{setup.recoveryCodes.join('\n')}</pre>
      <form action={confirm}>
        <input name="code" placeholder="6-digit code" />
        <button>Confirm</button>
      </form>
    </div>
  )
}
```

The `qrcode.react` import is one example of a QR renderer; any library that takes a URL works. You can also paste the `secret` value directly into the authenticator app if QR scanning isn't available.

## Recovery code use

```tsx
async function onUseRecoveryCode(code: string) {
  await useRecoveryCode(pending.challengeToken, code)
  alert('Signed in — consider generating new recovery codes since you used one.')
}
```

Recovery codes are single-use. After consumption the matching token row is deleted, so a second attempt with the same code fails with `INVALID_RECOVERY_CODE` (401). It's good UX to suggest re-running `setupTwoFactor` after a recovery-code use — that regenerates all 10 codes.

## Security notes

- **TOTP secret is plaintext at rest** by design. Encrypting only this column doesn't meaningfully help if the DB is compromised — passwords are hashed but everything else needs to be readable for the auth flow. If your DB is at risk, encrypt the whole DB (Postgres TDE, AWS RDS encryption, etc.), not one column.
- **Challenge tokens have a 5-minute TTL.** Long enough for the user to fetch their authenticator, short enough to limit the replay window if a token is intercepted.
- **Recovery codes are stored as SHA-256 hashes.** A leaked database doesn't expose the raw codes — same property as every other AuthCore token.
- **Disable requires password re-entry.** Even with a stolen session cookie, an attacker can't turn 2FA off without the password.
- **No `email_verified` check at enrollment** — if a user can sign in, they can enroll. Apps that need stricter onboarding (e.g. mandatory 2FA before first login) can add their own guard.

## Error codes

| Code | HTTP | Cause |
|------|------|-------|
| `TWO_FACTOR_NOT_SET_UP` | 400 | `enableTwoFactor` called before `setupTwoFactor` |
| `INVALID_TWO_FACTOR_CODE` | 400 / 401 | TOTP code doesn't match (during enable OR verify) |
| `INVALID_RECOVERY_CODE` | 401 | Recovery code is unknown, expired, or doesn't belong to the challenged user |
| `INVALID_TOKEN` | 401 | Challenge JWT is invalid, expired, or has the wrong scope |
| `INVALID_CREDENTIALS` | 401 | `disableTwoFactor` received a wrong password |

## Not yet implemented

- WebAuthn / passkeys (RFC FIDO2). Likely a v1.1 feature.
- SMS-based 2FA. Intentionally omitted — SMS 2FA has known weaknesses (SIM swap, SS7) and the industry has moved away from it.
- Backup-codes-as-grid printouts. The current `xxxx-xxxx-xxxx` format renders well in plain text; a print-friendly UI is the responsibility of the app.
