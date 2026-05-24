import type { DatabaseAdapter, EmailAdapter, EmailTemplate, Token } from '@authcore/types'
import { generateOpaqueToken, hashToken } from '../utils/token.js'
import { hashPassword } from '../utils/password.js'
import { defaultResetPasswordTemplate } from './templates.js'

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000 // 1 hour
const PASSWORD_RESET_TTL_HOURS = 1

/**
 * Initiate a password reset flow.
 * Always returns successfully even if the email is not found — prevents email enumeration.
 * Callers should catch and swallow errors from the email send step if needed.
 */
export async function createPasswordReset(params: {
  email: string
  db: DatabaseAdapter
  emailProvider: EmailAdapter
  from: string
  resetUrl: string
  template?: EmailTemplate<{ email: string; link: string; ttlHours: number }>
}): Promise<void> {
  const { email, db, emailProvider, from, resetUrl, template = defaultResetPasswordTemplate } = params

  // Always returns 200 — do not reveal whether the email exists
  const user = await db.findUserByEmail(email)
  if (!user) return

  const rawToken = generateOpaqueToken()
  const hashedToken = hashToken(rawToken)

  await db.createToken({
    userId: user.id,
    type: 'PASSWORD_RESET',
    token: hashedToken,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  })

  const link = `${resetUrl}?token=${rawToken}`
  const rendered = template({ email, link, ttlHours: PASSWORD_RESET_TTL_HOURS })

  await emailProvider.send({
    from,
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })
}

/**
 * Complete a password reset using the raw token from the reset email.
 *
 * @throws Error if the token is invalid or expired
 */
export async function resetPassword(params: {
  rawToken: string
  newPassword: string
  db: DatabaseAdapter
  saltRounds?: number
}): Promise<void> {
  const { rawToken, newPassword, db, saltRounds } = params

  const tokenRecord: Token | null = await db.findToken(rawToken, 'PASSWORD_RESET')

  if (!tokenRecord) {
    throw new Error('Invalid or expired reset token')
  }

  if (tokenRecord.expiresAt < new Date()) {
    await db.deleteToken(tokenRecord.id)
    throw new Error('Invalid or expired reset token')
  }

  const passwordHash = await hashPassword(newPassword, saltRounds)
  await db.updateUser(tokenRecord.userId, { passwordHash })
  await db.deleteToken(tokenRecord.id)
}
