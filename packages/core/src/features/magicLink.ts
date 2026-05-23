import type { DatabaseAdapter, EmailAdapter, EmailTemplate, Token, User } from '@authcore/types'
import { generateOpaqueToken, hashToken } from '../utils/token.js'
import { defaultMagicLinkTemplate } from './templates.js'

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000 // 15 minutes
const MAGIC_LINK_TTL_MINUTES = 15

/**
 * Sentinel passwordHash used when magic-link creates a brand-new user.
 *
 * Same shape as the OAuth sentinel — the user has no password initially and
 * can claim one via the standard forgot-password flow. This means a magic-link
 * signup is functionally identical to OAuth signup: an authenticated session
 * with no password set, and the standard "set a password" recovery path open.
 */
export const MAGIC_LINK_NO_PASSWORD_SENTINEL = '!MAGIC_LINK_NO_PASSWORD'

/**
 * Send a magic-link email. Always returns successfully (whether the user
 * exists or not) to prevent email enumeration.
 *
 * If `autoCreate` is true (the default) and no user exists for the email,
 * a new user is created with a sentinel password hash. The user's email is
 * marked verified — clicking a magic link from the inbox proves email
 * ownership the same way clicking a verification link does.
 *
 * @returns `true` if an email was sent, `false` otherwise. Callers should
 *   not surface this to the client — return 200 either way.
 */
export async function sendMagicLink(params: {
  email: string
  db: DatabaseAdapter
  emailProvider: EmailAdapter
  from: string
  magicLinkUrl: string
  /**
   * Defaults to `true`. When `false`, magic-link is login-only — emails to
   * unknown addresses are silently dropped (the response is still 200).
   */
  autoCreate?: boolean
  defaultRole?: string
  template?: EmailTemplate<{ email: string; link: string; ttlMinutes: number }>
}): Promise<boolean> {
  const {
    email,
    db,
    emailProvider,
    from,
    magicLinkUrl,
    autoCreate = true,
    defaultRole = 'user',
    template = defaultMagicLinkTemplate,
  } = params

  let user = await db.findUserByEmail(email)
  if (!user) {
    if (!autoCreate) return false
    user = await db.createUser({
      email,
      passwordHash: MAGIC_LINK_NO_PASSWORD_SENTINEL,
      role: defaultRole,
    })
    // Magic-link signup verifies the email by definition (the link arrives in
    // the inbox, proving ownership). Mark verified up front so the user isn't
    // gated on a second verification email.
    user = await db.updateUser(user.id, { emailVerified: true })
  }

  const rawToken = generateOpaqueToken()
  await db.createToken({
    userId: user.id,
    type: 'MAGIC_LINK',
    token: hashToken(rawToken),
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  })

  const link = `${magicLinkUrl}?token=${rawToken}`
  const rendered = template({ email, link, ttlMinutes: MAGIC_LINK_TTL_MINUTES })

  await emailProvider.send({
    from,
    to: email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })
  return true
}

/**
 * Consume a magic-link token. Returns the user (still as a stored DB record).
 * Caller is responsible for minting the session JWT + refresh token.
 *
 * Idempotency: tokens are single-use. After consumption the token row is
 * deleted, so a second call with the same raw token throws.
 *
 * @throws Error if the token is invalid or expired
 */
export async function consumeMagicLink(params: {
  rawToken: string
  db: DatabaseAdapter
}): Promise<{ user: User }> {
  const { rawToken, db } = params

  const tokenRecord: Token | null = await db.findToken(rawToken, 'MAGIC_LINK')
  if (!tokenRecord) {
    throw new Error('Invalid or expired magic-link token')
  }
  if (tokenRecord.expiresAt < new Date()) {
    await db.deleteToken(tokenRecord.id)
    throw new Error('Invalid or expired magic-link token')
  }

  const user = await db.findUserById(tokenRecord.userId)
  if (!user) {
    await db.deleteToken(tokenRecord.id)
    throw new Error('Invalid or expired magic-link token')
  }

  // Single-use: delete before returning so a replay returns the same error.
  await db.deleteToken(tokenRecord.id)
  return { user }
}
