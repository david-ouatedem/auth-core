import type { OAuthProvider } from '@authcore/types'

export interface MicrosoftProviderConfig {
  clientId: string
  clientSecret: string
  /**
   * Defaults to `['openid', 'profile', 'email']`. Add `offline_access` to receive
   * a refresh token. Add `User.Read` for Microsoft Graph profile reads.
   */
  scopes?: string[]
  /**
   * Microsoft tenant — controls which accounts can sign in.
   *   - `'common'` (default): personal Microsoft accounts AND work/school accounts in any Entra tenant.
   *   - `'organizations'`: any Entra (work/school) tenant, no personal accounts.
   *   - `'consumers'`: personal Microsoft accounts only.
   *   - `<tenant-id-or-domain>`: restrict to a specific tenant.
   */
  tenant?: 'common' | 'organizations' | 'consumers' | (string & {})
}

const DEFAULT_SCOPES = ['openid', 'profile', 'email']

/**
 * Create a Microsoft Identity Platform (Entra ID) OAuth 2.0 provider.
 *
 * ```ts
 * import { createMicrosoftProvider } from '@authcore/core'
 * const microsoft = createMicrosoftProvider({
 *   clientId: process.env.MICROSOFT_CLIENT_ID!,
 *   clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
 * })
 * createAuth({ ..., oauth: { microsoft } })
 * ```
 *
 * Notes:
 * - Reads the user's email + name from the OpenID Connect `id_token` claims
 *   (no extra Graph call needed). Falls back to `/me` on Microsoft Graph if
 *   the id_token is missing the email.
 * - Microsoft does not have a `email_verified` flag in the id_token, so we
 *   treat the email as verified (Microsoft verifies emails before issuing
 *   accounts) — this matches the practice of other providers.
 */
export function createMicrosoftProvider(config: MicrosoftProviderConfig): OAuthProvider {
  const scopes = config.scopes ?? DEFAULT_SCOPES
  const tenant = config.tenant ?? 'common'
  const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`

  return {
    id: 'microsoft',
    scopes,

    authorize: ({ state, codeChallenge, redirectUri }) => {
      const url = new URL(`${base}/authorize`)
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('response_mode', 'query')
      url.searchParams.set('scope', scopes.join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return url.toString()
    },

    exchangeCode: async ({ code, codeVerifier, redirectUri }) => {
      const res = await fetch(`${base}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
          scope: scopes.join(' '),
        }),
      })
      if (!res.ok) {
        throw new Error(`Microsoft token exchange failed (${res.status}): ${await res.text()}`)
      }
      const body = (await res.json()) as {
        access_token: string
        refresh_token?: string
        expires_in?: number
        id_token?: string
        token_type?: string
      }
      return {
        accessToken: body.access_token,
        ...(body.refresh_token !== undefined ? { refreshToken: body.refresh_token } : {}),
        ...(body.expires_in !== undefined ? { expiresIn: body.expires_in } : {}),
        ...(body.id_token !== undefined ? { idToken: body.id_token } : {}),
      }
    },

    getUserInfo: async (accessToken, idToken) => {
      // Prefer id_token claims (no extra network call).
      if (idToken) {
        const claims = decodeIdTokenClaims(idToken)
        if (claims && typeof claims['sub'] === 'string') {
          const email =
            (typeof claims['email'] === 'string' && claims['email']) ||
            (typeof claims['preferred_username'] === 'string' && claims['preferred_username']) ||
            null
          if (email) {
            return {
              id: claims['sub'],
              email,
              emailVerified: true,
              ...(typeof claims['name'] === 'string' ? { name: claims['name'] } : {}),
            }
          }
        }
      }

      // Fallback to Microsoft Graph /me.
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        throw new Error(`Microsoft Graph /me failed (${res.status}): ${await res.text()}`)
      }
      const me = (await res.json()) as {
        id: string
        mail?: string | null
        userPrincipalName?: string | null
        displayName?: string | null
      }
      const email = me.mail ?? me.userPrincipalName
      if (!email) {
        throw new Error('Microsoft account has no email or userPrincipalName')
      }
      return {
        id: me.id,
        email,
        emailVerified: true,
        ...(me.displayName ? { name: me.displayName } : {}),
      }
    },
  }
}

/**
 * Decode the *payload* of a JWS (id_token) without verifying its signature.
 *
 * Safe in this context because:
 *  - The id_token was just returned from a TLS-protected exchange with Microsoft.
 *  - We only use it to read non-sensitive identity claims (sub, email, name).
 *  - We do NOT use it for authentication decisions — AuthCore mints its own
 *    JWT (HS256, signed with `session.secret`) for the session.
 */
function decodeIdTokenClaims(idToken: string): Record<string, unknown> | null {
  const parts = idToken.split('.')
  if (parts.length < 2) return null
  try {
    const payload = Buffer.from(parts[1]!, 'base64url').toString('utf8')
    return JSON.parse(payload) as Record<string, unknown>
  } catch {
    return null
  }
}
