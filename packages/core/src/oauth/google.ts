import type { OAuthProvider } from '@authcore/types'

export interface GoogleProviderConfig {
  clientId: string
  clientSecret: string
  /** Defaults to `['openid', 'email', 'profile']` — matches the OpenID Connect minimum. */
  scopes?: string[]
}

const DEFAULT_SCOPES = ['openid', 'email', 'profile']

/**
 * Create a Google OAuth 2.0 / OpenID Connect provider.
 *
 * ```ts
 * import { createGoogleProvider } from '@authcore/core'
 * const google = createGoogleProvider({
 *   clientId: process.env.GOOGLE_CLIENT_ID!,
 *   clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
 * })
 * createAuth({ ..., oauth: { google } })
 * ```
 */
export function createGoogleProvider(config: GoogleProviderConfig): OAuthProvider {
  const scopes = config.scopes ?? DEFAULT_SCOPES
  return {
    id: 'google',
    scopes,

    authorize: ({ state, codeChallenge, redirectUri }) => {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', scopes.join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      // access_type=offline + prompt=consent ensures we get a refresh_token from Google.
      // Without these, Google only issues a refresh token on the user's FIRST consent.
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      return url.toString()
    },

    exchangeCode: async ({ code, codeVerifier, redirectUri }) => {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      })
      if (!res.ok) {
        throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`)
      }
      const body = (await res.json()) as {
        access_token: string
        refresh_token?: string
        expires_in?: number
        id_token?: string
      }
      return {
        accessToken: body.access_token,
        ...(body.refresh_token !== undefined ? { refreshToken: body.refresh_token } : {}),
        ...(body.expires_in !== undefined ? { expiresIn: body.expires_in } : {}),
        ...(body.id_token !== undefined ? { idToken: body.id_token } : {}),
      }
    },

    getUserInfo: async (accessToken) => {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        throw new Error(`Google userinfo failed (${res.status}): ${await res.text()}`)
      }
      const body = (await res.json()) as {
        sub: string
        email: string
        email_verified?: boolean
        name?: string
        picture?: string
      }
      return {
        id: body.sub,
        email: body.email,
        emailVerified: body.email_verified === true,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.picture !== undefined ? { picture: body.picture } : {}),
      }
    },
  }
}
