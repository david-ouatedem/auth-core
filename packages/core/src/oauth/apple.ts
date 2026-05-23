import { createSign } from 'node:crypto'
import type { OAuthProvider } from '@authcore/types'

export interface AppleProviderConfig {
  /**
   * Apple Services ID (the OAuth client id), e.g. `com.example.myapp.service`.
   * NOT the iOS app's Bundle ID — Sign in with Apple uses a separate Services ID
   * registered in Apple Developer → Identifiers.
   */
  clientId: string
  /** Apple Developer Team ID (10-char string, e.g. `ABC1234DEF`). */
  teamId: string
  /** Sign in with Apple Key ID (10-char string from the .p8 download). */
  keyId: string
  /**
   * The .p8 private key downloaded from Apple Developer → Keys. Pass the full
   * PEM string including `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----`.
   * Apple delivers the key once at creation time; store it as a secret env var.
   */
  privateKey: string
  /**
   * Defaults to `['name', 'email']`. Apple only returns `email` in the id_token —
   * `name` is delivered exactly once, on the first sign-in, via a posted form
   * field. AuthCore uses query response_mode and reads identity from the
   * id_token, so the `name` scope is effectively no-op here.
   */
  scopes?: string[]
  /**
   * Client secret JWT TTL in seconds. Defaults to 600 (10 minutes). Apple's
   * maximum is 6 months (15777000s); shorter is safer — we mint a fresh JWT
   * on every exchange anyway.
   */
  clientSecretTtlSeconds?: number
}

const DEFAULT_SCOPES = ['name', 'email']
const APPLE_AUD = 'https://appleid.apple.com'

/**
 * Create a Sign in with Apple OAuth 2.0 provider.
 *
 * Apple's protocol differs from other providers in one important way: the
 * `client_secret` sent to the token endpoint is **not** a static string. It's
 * an ES256-signed JWT minted on each exchange, signed with a `.p8` private
 * key from Apple Developer. AuthCore handles that for you.
 *
 * ```ts
 * import { createAppleProvider } from '@authcore/core'
 * const apple = createAppleProvider({
 *   clientId: 'com.example.myapp.service',         // Apple Services ID
 *   teamId: 'ABC1234DEF',                          // Apple Team ID
 *   keyId: 'XYZ9876ABC',                           // Key ID from the .p8 file
 *   privateKey: process.env.APPLE_PRIVATE_KEY!,    // contents of the .p8 (PEM)
 * })
 * createAuth({ ..., oauth: { apple } })
 * ```
 *
 * **Apple-specific notes:**
 * - Uses `response_mode=query` so the existing AuthCore callback route (GET)
 *   handles the response. (Apple's default `form_post` mode would require
 *   urlencoded body parsing on the callback; query mode works equivalently
 *   for the data we need.)
 * - Apple delivers the user's name **only on first sign-in** via a posted
 *   `user` form field that AuthCore does not consume in query mode. The
 *   sign-in still works — AuthCore creates the user with `name` unset; the
 *   user can edit their profile later. The email is always present.
 * - Apple's `email_verified` claim may be the string `"true"` or a boolean.
 *   AuthCore normalizes both to `true`.
 * - Some Apple users sign in with private relay emails (`*@privaterelay.appleid.com`).
 *   These are valid forwarding addresses; treat them as real emails.
 */
export function createAppleProvider(config: AppleProviderConfig): OAuthProvider {
  const scopes = config.scopes ?? DEFAULT_SCOPES
  const clientSecretTtl = config.clientSecretTtlSeconds ?? 600

  return {
    id: 'apple',
    scopes,

    authorize: ({ state, codeChallenge, redirectUri }) => {
      const url = new URL('https://appleid.apple.com/auth/authorize')
      url.searchParams.set('client_id', config.clientId)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('response_type', 'code')
      // Apple defaults to form_post; we use query to land on the existing
      // GET callback route. Apple supports both.
      url.searchParams.set('response_mode', 'query')
      url.searchParams.set('scope', scopes.join(' '))
      url.searchParams.set('state', state)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return url.toString()
    },

    exchangeCode: async ({ code, codeVerifier, redirectUri }) => {
      const clientSecret = generateAppleClientSecret({
        teamId: config.teamId,
        keyId: config.keyId,
        clientId: config.clientId,
        privateKey: config.privateKey,
        ttlSeconds: clientSecretTtl,
      })

      const res = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      })
      if (!res.ok) {
        throw new Error(`Apple token exchange failed (${res.status}): ${await res.text()}`)
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

    getUserInfo: async (_accessToken, idToken) => {
      if (!idToken) {
        throw new Error('Apple OAuth: id_token missing from token response')
      }
      const claims = decodeIdTokenClaims(idToken)
      if (!claims || typeof claims['sub'] !== 'string' || typeof claims['email'] !== 'string') {
        throw new Error('Apple OAuth: id_token missing required claims (sub, email)')
      }
      // Apple sends "true" / "false" as STRINGS in the id_token; some versions
      // return booleans. Normalize.
      const rawVerified = claims['email_verified']
      const emailVerified =
        rawVerified === true || rawVerified === 'true' ? true : false

      return {
        id: claims['sub'],
        email: claims['email'],
        emailVerified,
      }
    },
  }
}

/**
 * Generate the client secret JWT Apple requires on the token endpoint.
 * Signed with ES256 using the developer's .p8 private key.
 *
 * Claims per https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens
 */
export function generateAppleClientSecret(params: {
  teamId: string
  keyId: string
  clientId: string
  privateKey: string
  ttlSeconds?: number
}): string {
  const { teamId, keyId, clientId, privateKey, ttlSeconds = 600 } = params
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + ttlSeconds,
    aud: APPLE_AUD,
    sub: clientId,
  }

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signingInput = `${headerB64}.${payloadB64}`

  // Node's signer outputs DER-encoded ECDSA signatures; JWS requires raw R||S.
  // We use `dsaEncoding: 'ieee-p1363'` (Node 16.4+) which produces the raw form.
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })

  const sigB64 = Buffer.from(signature).toString('base64url')
  return `${signingInput}.${sigB64}`
}

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
