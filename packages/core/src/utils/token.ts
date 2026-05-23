import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'

/**
 * Generate a cryptographically random opaque token.
 * Returns a 64-character hex string (256 bits of entropy).
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Generate a CSRF token. Same shape as `generateOpaqueToken` (256 bits of entropy)
 * but kept as a separate export to make intent explicit at call sites.
 * The CSRF token is NOT hashed before storage — it's sent to the client as a cookie
 * value AND compared byte-for-byte against the `X-CSRF-Token` header on each request.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Generate a PKCE code verifier (RFC 7636 §4.1).
 * 32 random bytes → 43-char base64url string (no padding), within the 43-128 char range.
 */
export function generatePkceVerifier(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Build the PKCE code challenge (S256 method) from a verifier.
 * SHA-256 of the verifier, base64url-encoded (no padding).
 */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Hash a raw token using SHA-256 for safe database storage.
 * Store the hash; return the raw token to the user.
 *
 * @param rawToken - The raw token to hash
 * @returns SHA-256 hex digest
 */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Timing-safe comparison of two token strings.
 * Prevents timing attacks when comparing tokens.
 *
 * @returns true if the strings are equal
 */
export function safeCompareTokens(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  return timingSafeEqual(bufA, bufB)
}

export interface JwtPayload {
  sub: string
  email: string
  role: string
  iat?: number
  exp?: number
}

/**
 * Sign a JWT access token.
 *
 * @param payload - Data to encode in the token
 * @param secret - Signing secret
 * @param expiresIn - Expiry duration (e.g. '7d', '1h')
 * @returns Signed JWT string
 */
export function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn = '7d',
): string {
  // Cast options to avoid exactOptionalPropertyTypes conflict with the jwt overloads
  const options = { algorithm: 'HS256' as const, expiresIn }
  return jwt.sign(payload, secret, options as jwt.SignOptions)
}

/**
 * Verify and decode a JWT.
 *
 * @param token - JWT string to verify
 * @param secret - Signing secret
 * @returns Decoded payload, or null if invalid/expired
 */
export function verifyJwt(token: string, secret: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] })
    if (typeof decoded === 'string') return null
    return decoded as JwtPayload
  } catch {
    return null
  }
}
