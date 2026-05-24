import type { DatabaseAdapter, Token } from '@authcore/types'
import { generateOpaqueToken, hashToken } from '../utils/token.js'

const DEFAULT_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Issue a new refresh token for the given user.
 * Returns the raw token (caller sends this to the client). The DB stores only the SHA-256 hash.
 */
export async function issueRefreshToken(params: {
  userId: string
  db: DatabaseAdapter
  ttlMs?: number
}): Promise<string> {
  const { userId, db, ttlMs = DEFAULT_REFRESH_TTL_MS } = params
  const rawToken = generateOpaqueToken()
  await db.createToken({
    userId,
    type: 'REFRESH',
    token: hashToken(rawToken),
    expiresAt: new Date(Date.now() + ttlMs),
  })
  return rawToken
}

/**
 * Rotate a refresh token: validate the incoming raw token, delete it, and issue a fresh one.
 * Throws on invalid/expired/already-rotated input — these are the same failure mode for the
 * client (they need to re-authenticate).
 */
export async function rotateRefreshToken(params: {
  rawToken: string
  db: DatabaseAdapter
  ttlMs?: number
}): Promise<{ userId: string; newRawToken: string }> {
  const { rawToken, db, ttlMs = DEFAULT_REFRESH_TTL_MS } = params

  const tokenRecord: Token | null = await db.findToken(rawToken, 'REFRESH')
  if (!tokenRecord) {
    throw new Error('Invalid or expired refresh token')
  }
  if (tokenRecord.expiresAt < new Date()) {
    await db.deleteToken(tokenRecord.id)
    throw new Error('Invalid or expired refresh token')
  }

  // Rotate: delete old, issue new
  await db.deleteToken(tokenRecord.id)
  const newRawToken = await issueRefreshToken({ userId: tokenRecord.userId, db, ttlMs })

  return { userId: tokenRecord.userId, newRawToken }
}

/**
 * Revoke a single refresh token by its raw value. Idempotent — if the token
 * doesn't exist (already revoked or never issued), this is a no-op.
 */
export async function revokeRefreshToken(params: {
  rawToken: string
  db: DatabaseAdapter
}): Promise<void> {
  const { rawToken, db } = params
  const tokenRecord = await db.findToken(rawToken, 'REFRESH')
  if (tokenRecord) {
    await db.deleteToken(tokenRecord.id)
  }
}

/**
 * Revoke every outstanding refresh token for a user. Used by "log out everywhere"
 * and by password-reset / security-event flows where you want to invalidate all
 * device sessions.
 */
export async function revokeAllRefreshTokensForUser(params: {
  userId: string
  db: DatabaseAdapter
}): Promise<void> {
  const { userId, db } = params
  await db.deleteTokensByUserAndType(userId, 'REFRESH')
}
