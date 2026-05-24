import type { DatabaseAdapter, EmailAdapter, EmailTemplate, Token } from '@authcore/types'
import { generateOpaqueToken, hashToken } from '../utils/token.js'
import { hashPassword } from '../utils/password.js'
import { defaultInvitationTemplate } from './templates.js'

const INVITATION_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours
const INVITATION_TTL_HOURS = 48

/**
 * Create an invitation for a new user.
 * Creates the user record (with no usable password) and sends an invitation email.
 *
 * @throws Error if a user with the given email already exists
 */
export async function createInvitation(params: {
  email: string
  role: string
  db: DatabaseAdapter
  emailProvider: EmailAdapter
  from: string
  inviteUrl: string
  template?: EmailTemplate<{ email: string; link: string; ttlHours: number; role: string }>
}): Promise<string> {
  const {
    email, role, db, emailProvider, from, inviteUrl,
    template = defaultInvitationTemplate,
  } = params

  const existing = await db.findUserByEmail(email)
  if (existing) {
    throw new Error('A user with this email already exists')
  }

  // Create user with a placeholder password hash (cannot be used to login)
  const user = await db.createUser({
    email,
    passwordHash: '!INVITED_NO_PASSWORD',
    role,
  })

  const rawToken = generateOpaqueToken()
  const hashedToken = hashToken(rawToken)

  await db.createToken({
    userId: user.id,
    type: 'INVITATION',
    token: hashedToken,
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
  })

  const link = `${inviteUrl}?token=${rawToken}`
  const rendered = template({ email, link, ttlHours: INVITATION_TTL_HOURS, role })

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
 * Accept an invitation by setting the user's password.
 * Marks the user's email as verified and deletes the invitation token.
 *
 * @throws Error if the token is invalid or expired
 */
export async function acceptInvitation(params: {
  rawToken: string
  newPassword: string
  db: DatabaseAdapter
  saltRounds?: number
}): Promise<{ userId: string }> {
  const { rawToken, newPassword, db, saltRounds } = params

  const tokenRecord: Token | null = await db.findToken(rawToken, 'INVITATION')

  if (!tokenRecord) {
    throw new Error('Invalid or expired invitation token')
  }

  if (tokenRecord.expiresAt < new Date()) {
    await db.deleteToken(tokenRecord.id)
    throw new Error('Invalid or expired invitation token')
  }

  const passwordHash = await hashPassword(newPassword, saltRounds)
  await db.updateUser(tokenRecord.userId, { passwordHash, emailVerified: true })
  await db.deleteToken(tokenRecord.id)

  return { userId: tokenRecord.userId }
}
