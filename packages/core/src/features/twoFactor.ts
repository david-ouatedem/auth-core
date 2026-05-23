import type { DatabaseAdapter, User } from '@authcore/types'
import {
  generateTotpSecret,
  verifyTotpCode,
  buildOtpauthUrl,
  generateRecoveryCodes,
} from '../utils/totp.js'
import { hashToken } from '../utils/token.js'

/**
 * Begin 2FA enrollment for a user.
 *
 * Generates a fresh TOTP secret + a fresh set of recovery codes. The secret is
 * stored on the user immediately so a `setup → enable` sequence on the same
 * device works, but `twoFactorEnabled` stays `false` until `enableTwoFactor`
 * verifies the first code from the authenticator app.
 *
 * Recovery codes are SHA-256 hashed before storage (same pattern as every
 * other AuthCore token). The raw codes are returned ONCE — the caller MUST
 * show them to the user, who copies them down.
 */
export async function setupTwoFactor(params: {
  userId: string
  email: string
  issuer: string
  db: DatabaseAdapter
}): Promise<{ secret: string; otpauthUrl: string; recoveryCodes: string[] }> {
  const { userId, email, issuer, db } = params

  const secret = generateTotpSecret()
  const recoveryCodes = generateRecoveryCodes(10)

  // Persist the secret on the user (still disabled). If the user re-runs setup,
  // this overwrites the previous secret — they need to re-scan their authenticator.
  await db.updateUser(userId, { twoFactorSecret: secret })

  // Wipe any prior recovery codes (idempotent re-enrollment).
  await db.deleteTokensByUserAndType(userId, 'RECOVERY_CODE')

  // Persist hashed recovery codes — no expiry, single-use.
  const farFuture = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
  for (const raw of recoveryCodes) {
    await db.createToken({
      userId,
      type: 'RECOVERY_CODE',
      token: hashToken(raw),
      expiresAt: farFuture,
    })
  }

  const otpauthUrl = buildOtpauthUrl({ secret, accountName: email, issuer })
  return { secret, otpauthUrl, recoveryCodes }
}

/**
 * Enable 2FA for a user. Requires a valid TOTP code matching the secret stored
 * during {@link setupTwoFactor}. Idempotent against the already-enabled state.
 *
 * @throws Error('TWO_FACTOR_NOT_SET_UP') if setup hasn't run.
 * @throws Error('INVALID_TWO_FACTOR_CODE') if the code doesn't match.
 */
export async function enableTwoFactor(params: {
  userId: string
  code: string
  db: DatabaseAdapter
}): Promise<void> {
  const { userId, code, db } = params
  const user = await db.findUserById(userId)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (!user.twoFactorSecret) throw new Error('TWO_FACTOR_NOT_SET_UP')

  if (!verifyTotpCode(user.twoFactorSecret, code)) {
    throw new Error('INVALID_TWO_FACTOR_CODE')
  }

  await db.updateUser(userId, { twoFactorEnabled: true })
}

/**
 * Disable 2FA for a user. Clears the secret + all recovery codes + the enabled flag.
 *
 * Callers are responsible for additional confirmation (e.g. password re-entry) —
 * this function trusts that the caller has already authorized the action.
 */
export async function disableTwoFactor(params: {
  userId: string
  db: DatabaseAdapter
}): Promise<void> {
  const { userId, db } = params
  await db.updateUser(userId, { twoFactorEnabled: false, twoFactorSecret: null })
  await db.deleteTokensByUserAndType(userId, 'RECOVERY_CODE')
}

/**
 * Verify a TOTP code as the second factor in a login challenge.
 * Returns the user record on success.
 *
 * @throws Error('USER_NOT_FOUND') if no user with that id.
 * @throws Error('TWO_FACTOR_NOT_ENABLED') if the user has not enrolled.
 * @throws Error('INVALID_TWO_FACTOR_CODE') on mismatch.
 */
export async function verifyTwoFactor(params: {
  userId: string
  code: string
  db: DatabaseAdapter
}): Promise<User> {
  const { userId, code, db } = params
  const user = await db.findUserById(userId)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new Error('TWO_FACTOR_NOT_ENABLED')
  }
  if (!verifyTotpCode(user.twoFactorSecret, code)) {
    throw new Error('INVALID_TWO_FACTOR_CODE')
  }
  return user
}

/**
 * Use a single-use recovery code instead of a TOTP code. The matching token
 * row is deleted before this function returns so a replay fails.
 *
 * @throws Error('USER_NOT_FOUND') if the user does not exist.
 * @throws Error('TWO_FACTOR_NOT_ENABLED') if 2FA is not enrolled for the user.
 * @throws Error('INVALID_RECOVERY_CODE') if the code is unknown.
 */
export async function useRecoveryCode(params: {
  userId: string
  rawCode: string
  db: DatabaseAdapter
}): Promise<User> {
  const { userId, rawCode, db } = params
  const user = await db.findUserById(userId)
  if (!user) throw new Error('USER_NOT_FOUND')
  if (!user.twoFactorEnabled) throw new Error('TWO_FACTOR_NOT_ENABLED')

  const tokenRecord = await db.findToken(rawCode, 'RECOVERY_CODE')
  // The token must (1) exist, (2) belong to this user, (3) be non-expired.
  // Recovery codes are stored with a far-future expiry so the second check is
  // belt-and-suspenders — but verifying user ownership prevents an attacker
  // who knows one user's recovery code from authenticating as someone else.
  if (!tokenRecord || tokenRecord.userId !== userId) {
    throw new Error('INVALID_RECOVERY_CODE')
  }
  if (tokenRecord.expiresAt < new Date()) {
    await db.deleteToken(tokenRecord.id)
    throw new Error('INVALID_RECOVERY_CODE')
  }
  // Single-use: delete first so a concurrent replay fails.
  await db.deleteToken(tokenRecord.id)
  return user
}
