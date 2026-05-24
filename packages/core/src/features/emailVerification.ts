import type { DatabaseAdapter, EmailAdapter, EmailTemplate, Token } from '@authcore/types'
import { generateOpaqueToken, hashToken } from '../utils/token.js'
import { defaultVerifyEmailTemplate } from './templates.js'

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const EMAIL_VERIFICATION_TTL_HOURS = 24

/**
 * Create an email verification token and send the verification email.
 *
 * @returns The raw token (not the hash). Store only the hash in DB.
 */
export async function createEmailVerification(params: {
  userId: string
  email: string
  db: DatabaseAdapter
  emailProvider: EmailAdapter
  from: string
  verificationUrl: string
  template?: EmailTemplate<{ email: string; link: string; ttlHours: number }>
}): Promise<string> {
  const {
    userId, email, db, emailProvider, from, verificationUrl,
    template = defaultVerifyEmailTemplate,
  } = params

  const rawToken = generateOpaqueToken()
  const hashedToken = hashToken(rawToken)

  await db.createToken({
    userId,
    type: 'EMAIL_VERIFICATION',
    token: hashedToken,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  })

  const link = `${verificationUrl}?token=${rawToken}`
  const rendered = template({ email, link, ttlHours: EMAIL_VERIFICATION_TTL_HOURS })

  await emailProvider.send({
    from,
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })

  return rawToken
}

/**
 * Verify an email address using the raw token from the user's email link.
 *
 * @throws Error if the token is invalid or expired
 */
export async function verifyEmail(params: {
  rawToken: string
  db: DatabaseAdapter
}): Promise<void> {
  const { rawToken, db } = params

  const tokenRecord: Token | null = await db.findToken(rawToken, 'EMAIL_VERIFICATION')

  if (!tokenRecord) {
    throw new Error('Invalid or expired verification token')
  }

  if (tokenRecord.expiresAt < new Date()) {
    await db.deleteToken(tokenRecord.id)
    throw new Error('Invalid or expired verification token')
  }

  await db.updateUser(tokenRecord.userId, { emailVerified: true })
  await db.deleteToken(tokenRecord.id)
}
