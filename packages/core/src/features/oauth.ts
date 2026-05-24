import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  DatabaseAdapter,
  OAuthAccount,
  OAuthProvider,
  User,
} from '@authcore/types'
import { generateOpaqueToken, generatePkceVerifier, pkceChallenge } from '../utils/token.js'

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const OAUTH_NO_PASSWORD_SENTINEL = '!OAUTH_NO_PASSWORD'

/**
 * State envelope persisted ALONGSIDE the OAuth state row (in 0.11 we keep it stateless
 * and HMAC-sign the envelope with the AuthCore secret — see startOAuth/completeOAuth).
 *
 * Carries everything the callback needs to verify the round-trip:
 *   - nonce: defense in depth (a random per-request id).
 *   - provider: must match the provider that received the callback.
 *   - codeVerifier: PKCE verifier; the provider already saw its challenge.
 *   - redirectUri: must equal what was sent at start time, per OAuth 2.0 §10.6.
 *   - issuedAt: TTL guard (10 min) — auth codes are short-lived anyway.
 */
interface OAuthStateEnvelope {
  nonce: string
  provider: string
  codeVerifier: string
  redirectUri: string
  issuedAt: number
}

/** base64url(envelope) + '.' + base64url(hmac(envelope)) */
function signEnvelope(env: OAuthStateEnvelope, secret: string): string {
  const json = JSON.stringify(env)
  const payload = Buffer.from(json, 'utf8').toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

function verifyEnvelope(signed: string, secret: string): OAuthStateEnvelope | null {
  const dot = signed.lastIndexOf('.')
  if (dot < 0) return null
  const payload = signed.slice(0, dot)
  const sig = signed.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  // Timing-safe compare
  const sigBuf = Buffer.from(sig, 'utf8')
  const expBuf = Buffer.from(expected, 'utf8')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null
  try {
    const env = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<OAuthStateEnvelope>
    if (
      typeof env.nonce !== 'string' ||
      typeof env.provider !== 'string' ||
      typeof env.codeVerifier !== 'string' ||
      typeof env.redirectUri !== 'string' ||
      typeof env.issuedAt !== 'number'
    ) return null
    return env as OAuthStateEnvelope
  } catch {
    return null
  }
}

/**
 * Begin an OAuth Authorization Code + PKCE flow.
 *
 * Generates a state envelope (nonce, provider, PKCE verifier, redirectUri, issuedAt)
 * HMAC-signed with the AuthCore secret so the callback can verify integrity without
 * a DB round-trip. Returns the provider's authorization URL.
 */
export async function startOAuth(params: {
  provider: OAuthProvider
  redirectUri: string
  secret: string
}): Promise<{ authorizationUrl: string; state: string }> {
  const { provider, redirectUri, secret } = params

  const env: OAuthStateEnvelope = {
    nonce: generateOpaqueToken(),
    provider: provider.id,
    codeVerifier: generatePkceVerifier(),
    redirectUri,
    issuedAt: Date.now(),
  }
  const state = signEnvelope(env, secret)
  const authorizationUrl = provider.authorize({
    state,
    codeChallenge: pkceChallenge(env.codeVerifier),
    redirectUri,
  })
  return { authorizationUrl, state }
}

/**
 * Complete an OAuth callback. Verifies the HMAC-signed state, exchanges the code with
 * the provider for tokens, fetches the user profile, and applies the auto-link policy:
 *
 *   - existing OAuthAccount (provider, providerId)         → load user, return.
 *   - no OAuthAccount, no local user                       → create user (sentinel passwordHash) + link.
 *   - no OAuthAccount, local user, emailVerified=true      → link to existing user.
 *   - no OAuthAccount, local user, emailVerified=false     → throw EMAIL_NOT_VERIFIED_BY_PROVIDER (409).
 */
export async function completeOAuth(params: {
  provider: OAuthProvider
  state: string
  code: string
  redirectUri: string
  secret: string
  db: DatabaseAdapter
  defaultRole: string
}): Promise<{ user: User; oauthAccount: OAuthAccount; isNewUser: boolean }> {
  const { provider, state, code, redirectUri, secret, db, defaultRole } = params

  // 1. Verify HMAC envelope
  const env = verifyEnvelope(state, secret)
  if (!env) throw oauthError('Invalid OAuth state', 'INVALID_TOKEN', 401)
  if (env.provider !== provider.id) throw oauthError('OAuth state provider mismatch', 'INVALID_TOKEN', 401)
  if (env.redirectUri !== redirectUri) throw oauthError('OAuth state redirectUri mismatch', 'INVALID_TOKEN', 401)
  if (Date.now() - env.issuedAt > OAUTH_STATE_TTL_MS) {
    throw oauthError('OAuth state expired', 'INVALID_TOKEN', 401)
  }

  // 2. Exchange code for tokens
  let tokens
  try {
    tokens = await provider.exchangeCode({ code, codeVerifier: env.codeVerifier, redirectUri })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provider exchange failed'
    throw oauthError(message, 'OAUTH_EXCHANGE_FAILED', 502)
  }

  // 3. Fetch user info
  let profile
  try {
    profile = await provider.getUserInfo(tokens.accessToken, tokens.idToken)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Provider userinfo failed'
    throw oauthError(message, 'OAUTH_USERINFO_FAILED', 502)
  }

  // 4. Existing OAuth account? Update tokens and return user.
  const existing = await db.findOAuthAccount(provider.id, profile.id)
  if (existing) {
    const updated = await db.updateOAuthAccount(existing.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
    })
    const user = await db.findUserById(existing.userId)
    if (!user) {
      throw oauthError('Linked user no longer exists', 'INVALID_TOKEN', 401)
    }
    return { user, oauthAccount: updated, isNewUser: false }
  }

  // 5. No OAuth account. Try to link by email.
  const localUser = await db.findUserByEmail(profile.email)
  if (localUser) {
    if (!profile.emailVerified) {
      throw oauthError(
        'Email not verified by provider; sign in with your password to link this OAuth account',
        'EMAIL_NOT_VERIFIED_BY_PROVIDER',
        409,
      )
    }
    const oauthAccount = await db.createOAuthAccount({
      userId: localUser.id,
      provider: provider.id,
      providerAccountId: profile.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
    })
    return { user: localUser, oauthAccount, isNewUser: false }
  }

  // 6. Brand new user — create with sentinel passwordHash.
  const newUser = await db.createUser({
    email: profile.email,
    passwordHash: OAUTH_NO_PASSWORD_SENTINEL,
    role: defaultRole,
  })
  if (profile.emailVerified) {
    await db.updateUser(newUser.id, { emailVerified: true })
    newUser.emailVerified = true
  }
  const oauthAccount = await db.createOAuthAccount({
    userId: newUser.id,
    provider: provider.id,
    providerAccountId: profile.id,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null,
    expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
  })
  return { user: newUser, oauthAccount, isNewUser: true }
}

/** Local helper — kept decoupled from auth.ts's AuthError so feature stays portable. */
function oauthError(message: string, code: string, statusCode: number): Error {
  const err = new Error(message) as Error & { code: string; statusCode: number; isOAuthError: true }
  err.name = 'OAuthError'
  err.code = code
  err.statusCode = statusCode
  err.isOAuthError = true
  return err
}
