import type { AuthCoreConfig, PublicUser } from '@authcore/types'
import { hashPassword, verifyPassword } from './utils/password.js'
import { signJwt, verifyJwt } from './utils/token.js'
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './utils/validation.js'
import {
  createEmailVerification,
  verifyEmail as verifyEmailFeature,
} from './features/emailVerification.js'
import {
  createPasswordReset,
  resetPassword as resetPasswordFeature,
} from './features/passwordReset.js'
import {
  createInvitation,
  acceptInvitation as acceptInvitationFeature,
} from './features/invitation.js'
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
} from './features/refresh.js'
import { startOAuth, completeOAuth } from './features/oauth.js'
import { sendMagicLink as sendMagicLinkFeature, consumeMagicLink as consumeMagicLinkFeature } from './features/magicLink.js'
import {
  inviteSchema,
  acceptInvitationSchema,
  sendMagicLinkSchema,
  consumeMagicLinkSchema,
} from './utils/validation.js'

/** Parse an `expiresIn` value (e.g. '30d', '15m', '2h', '90s') into milliseconds. */
function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs
  const match = value.match(/^(\d+)\s*([smhd])$/)
  if (!match) return fallbackMs
  const n = Number(match[1])
  const unit = match[2]
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000
  return n * mult
}

const DEFAULT_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30d

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * The AuthCore instance returned by createAuth.
 * Framework adapters (Express, Fastify) wrap this object.
 */
export interface AuthCore {
  /**
   * Register a new user.
   * @throws AuthError on validation failure (400) or duplicate email (409)
   */
  register(input: unknown): Promise<{ user: PublicUser; token: string; refreshToken: string }>

  /**
   * Authenticate a user with email/password.
   * @throws AuthError on invalid credentials (401)
   */
  login(input: unknown): Promise<{ user: PublicUser; token: string; refreshToken: string }>

  /**
   * Verify a JWT and return the public user.
   * Returns null if the token is invalid or expired.
   */
  verifyToken(token: string): Promise<PublicUser | null>

  /**
   * Initiate email verification (requires emailVerification feature).
   * Sends a verification email.
   */
  sendEmailVerification(params: {
    userId: string
    email: string
    verificationUrl: string
  }): Promise<void>

  /**
   * Complete email verification using the raw token.
   * @throws AuthError if token is invalid or expired (400)
   */
  verifyEmail(input: unknown): Promise<void>

  /**
   * Initiate password reset. Always returns successfully when called via a framework
   * adapter (prevents email enumeration). Throws `MISSING_URL` (500) if called directly
   * without a `resetUrl`. Framework adapters always supply one built from baseUrl +
   * the configured reset-password route.
   */
  forgotPassword(input: unknown, params?: { resetUrl: string }): Promise<void>

  /**
   * Complete password reset using the raw token.
   * @throws AuthError if token is invalid or expired (400)
   */
  resetPassword(input: unknown): Promise<void>

  /**
   * Invite a new user by email with an optional role.
   * Creates the user record and sends an invitation email.
   * @throws AuthError if user already exists (409) or feature not enabled
   */
  invite(input: unknown, params: { inviteUrl: string }): Promise<void>

  /**
   * Accept an invitation by setting a password.
   * @throws AuthError if token is invalid or expired (400)
   */
  acceptInvitation(input: unknown): Promise<{ user: PublicUser; token: string; refreshToken: string }>

  /**
   * Exchange a refresh token for a new JWT + a freshly rotated refresh token.
   * The old refresh token is invalidated atomically.
   * @throws AuthError(401, 'INVALID_TOKEN') if the refresh token is missing, invalid, or expired
   */
  refresh(rawRefreshToken: string): Promise<{ user: PublicUser; token: string; refreshToken: string }>

  /**
   * Revoke a single refresh token. Idempotent — succeeds even if the token doesn't exist.
   */
  revoke(rawRefreshToken: string): Promise<void>

  /**
   * Revoke every outstanding refresh token for a user ("log out everywhere").
   */
  revokeAll(userId: string): Promise<void>

  /**
   * Send a magic-link email. Always resolves successfully — does not reveal
   * whether the email exists in the database (enumeration-safe). By default
   * a new user is auto-created if none exists; the email is marked verified
   * because receipt of the link proves email ownership.
   *
   * Requires the `magicLink` feature flag and a configured email provider.
   *
   * @throws AuthError(500, 'FEATURE_DISABLED') if the feature flag is off.
   * @throws AuthError(500, 'EMAIL_NOT_CONFIGURED') if no email provider is set.
   * @throws AuthError(500, 'MISSING_URL') if `magicLinkUrl` is not supplied.
   */
  sendMagicLink(input: unknown, params: { magicLinkUrl: string }): Promise<void>

  /**
   * Consume a magic-link token. Returns a full session: user + JWT + refresh.
   * Tokens are single-use; a second call with the same raw token throws.
   * @throws AuthError(400, 'INVALID_TOKEN') if the token is unknown or expired.
   */
  consumeMagicLink(input: unknown): Promise<{ user: PublicUser; token: string; refreshToken: string }>

  /**
   * Begin an OAuth flow with the provider registered under the given id (e.g. 'google').
   * Returns the authorization URL the user must be redirected to.
   * @throws AuthError if the provider isn't registered in `config.oauth`.
   */
  oauthStart(
    providerId: string,
    redirectUri: string,
  ): Promise<{ authorizationUrl: string; state: string }>

  /**
   * Complete an OAuth callback. Validates state, exchanges code for tokens, links or creates
   * the user according to the auto-link policy (email-verified only).
   * @throws AuthError on invalid state (401), EMAIL_NOT_VERIFIED_BY_PROVIDER (409), or
   *   upstream provider failure (502).
   */
  oauthCallback(
    providerId: string,
    params: { code: string; state: string; redirectUri: string },
  ): Promise<{ user: PublicUser; token: string; refreshToken: string; isNewUser: boolean }>

  /** The resolved configuration this instance was created with. */
  readonly config: AuthCoreConfig
}

function toPublicUser(user: {
  id: string
  email: string
  emailVerified: boolean
  role: string
  createdAt: Date
  updatedAt: Date
  passwordHash: string
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

/**
 * Create an AuthCore instance from the provided configuration.
 * This is the main entry point for the core package.
 *
 * @example
 * ```ts
 * import { createAuth } from '@authcore/core'
 * import { prismaAdapter } from '@authcore/prisma-adapter'
 *
 * const auth = createAuth({
 *   db: prismaAdapter(prisma),
 *   session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
 * })
 * ```
 */
export function createAuth(config: AuthCoreConfig): AuthCore {
  const { db, session, email, features = [], password: pwConfig = {}, callbacks = {}, rbac = {} } = config
  const saltRounds = pwConfig.saltRounds ?? 12
  const minPasswordLength = pwConfig.minLength ?? 8
  const expiresIn = session.expiresIn ?? '7d'
  const defaultRole = rbac.defaultRole ?? 'user'
  const refreshTtlMs = parseDurationMs(session.refreshExpiresIn, DEFAULT_REFRESH_TTL_MS)

  const hasEmailVerification = features.includes('emailVerification')
  const hasPasswordReset = features.includes('passwordReset')
  const hasInvitation = features.includes('invitation')
  const hasMagicLink = features.includes('magicLink')

  return {
    async register(input) {
      const schema = registerSchema(minPasswordLength)
      const parsed = schema.safeParse(input)
      if (!parsed.success) {
        throw new AuthError(
          parsed.error.errors[0]?.message ?? 'Validation failed',
          'VALIDATION_ERROR',
          400,
        )
      }

      const { email: userEmail, password } = parsed.data

      const existing = await db.findUserByEmail(userEmail)
      if (existing) {
        throw new AuthError('An account with this email already exists', 'EMAIL_EXISTS', 409)
      }

      const passwordHash = await hashPassword(password, saltRounds)
      const user = await db.createUser({ email: userEmail, passwordHash, role: defaultRole })
      const publicUser = toPublicUser(user)

      const token = signJwt({ sub: user.id, email: user.email, role: user.role }, session.secret, expiresIn)
      const refreshToken = await issueRefreshToken({ userId: user.id, db, ttlMs: refreshTtlMs })

      await callbacks.onSignUp?.(publicUser)

      return { user: publicUser, token, refreshToken }
    },

    async login(input) {
      const parsed = loginSchema.safeParse(input)
      if (!parsed.success) {
        throw new AuthError(
          parsed.error.errors[0]?.message ?? 'Validation failed',
          'VALIDATION_ERROR',
          400,
        )
      }

      const { email: userEmail, password } = parsed.data

      const user = await db.findUserByEmail(userEmail)
      if (!user) {
        await callbacks.onFailedLogin?.(userEmail, 'INVALID_CREDENTIALS')
        throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
      }

      const valid = await verifyPassword(password, user.passwordHash)
      if (!valid) {
        await callbacks.onFailedLogin?.(userEmail, 'INVALID_CREDENTIALS')
        throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
      }

      if (hasEmailVerification && !user.emailVerified) {
        await callbacks.onFailedLogin?.(userEmail, 'EMAIL_NOT_VERIFIED')
        throw new AuthError(
          'Please verify your email address before signing in',
          'EMAIL_NOT_VERIFIED',
          403,
        )
      }

      const publicUser = toPublicUser(user)
      const token = signJwt({ sub: user.id, email: user.email, role: user.role }, session.secret, expiresIn)
      const refreshToken = await issueRefreshToken({ userId: user.id, db, ttlMs: refreshTtlMs })

      await callbacks.onSignIn?.(publicUser)

      return { user: publicUser, token, refreshToken }
    },

    async verifyToken(token) {
      const payload = verifyJwt(token, session.secret)
      if (!payload) return null

      const user = await db.findUserById(payload.sub)
      if (!user) return null

      return toPublicUser(user)
    },

    async sendEmailVerification({ userId, email: userEmail, verificationUrl }) {
      if (!hasEmailVerification) {
        throw new AuthError(
          'emailVerification feature is not enabled',
          'FEATURE_DISABLED',
          500,
        )
      }
      if (!email) {
        throw new AuthError('Email provider is not configured', 'EMAIL_NOT_CONFIGURED', 500)
      }
      await createEmailVerification({
        userId,
        email: userEmail,
        db,
        emailProvider: email.provider,
        from: email.from,
        verificationUrl,
        ...(email.templates?.verifyEmail ? { template: email.templates.verifyEmail } : {}),
      })
    },

    async verifyEmail(input) {
      const parsed = verifyEmailSchema.safeParse(input)
      if (!parsed.success) {
        throw new AuthError(
          parsed.error.errors[0]?.message ?? 'Validation failed',
          'VALIDATION_ERROR',
          400,
        )
      }
      try {
        await verifyEmailFeature({ rawToken: parsed.data.token, db })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid token'
        throw new AuthError(message, 'INVALID_TOKEN', 400)
      }
    },

    async forgotPassword(input, params) {
      if (!hasPasswordReset) {
        // Silently ignore — don't reveal feature status
        return
      }

      const parsed = forgotPasswordSchema.safeParse(input)
      if (!parsed.success) {
        // Still return successfully to prevent enumeration
        return
      }

      if (!email) return

      if (!params?.resetUrl) {
        throw new AuthError(
          'resetUrl is required when the passwordReset feature is enabled',
          'MISSING_URL',
          500,
        )
      }

      // Intentionally swallow errors — always return 200
      try {
        await createPasswordReset({
          email: parsed.data.email,
          db,
          emailProvider: email.provider,
          from: email.from,
          resetUrl: params.resetUrl,
          ...(email.templates?.resetPassword ? { template: email.templates.resetPassword } : {}),
        })
      } catch {
        // Swallow — no email enumeration
      }
    },

    async resetPassword(input) {
      const schema = resetPasswordSchema(minPasswordLength)
      const parsed = schema.safeParse(input)
      if (!parsed.success) {
        throw new AuthError(
          parsed.error.errors[0]?.message ?? 'Validation failed',
          'VALIDATION_ERROR',
          400,
        )
      }
      try {
        await resetPasswordFeature({
          rawToken: parsed.data.token,
          newPassword: parsed.data.password,
          db,
          saltRounds,
        })
        const tokenRecord = await db.findToken(parsed.data.token, 'PASSWORD_RESET')
        if (tokenRecord) {
          const user = await db.findUserById(tokenRecord.userId)
          if (user) {
            await callbacks.onPasswordReset?.(toPublicUser(user))
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid token'
        throw new AuthError(message, 'INVALID_TOKEN', 400)
      }
    },

    async invite(input, { inviteUrl }) {
      if (!hasInvitation) {
        throw new AuthError('invitation feature is not enabled', 'FEATURE_DISABLED', 500)
      }
      if (!email) {
        throw new AuthError('Email provider is not configured', 'EMAIL_NOT_CONFIGURED', 500)
      }

      const parsed = inviteSchema.safeParse(input)
      if (!parsed.success) {
        throw new AuthError(
          parsed.error.errors[0]?.message ?? 'Validation failed',
          'VALIDATION_ERROR',
          400,
        )
      }

      try {
        await createInvitation({
          email: parsed.data.email,
          role: parsed.data.role ?? defaultRole,
          db,
          emailProvider: email.provider,
          from: email.from,
          inviteUrl,
          ...(email.templates?.invitation ? { template: email.templates.invitation } : {}),
        })
      } catch (err) {
        if (err instanceof Error && err.message.includes('already exists')) {
          throw new AuthError('A user with this email already exists', 'EMAIL_EXISTS', 409)
        }
        throw err
      }
    },

    async acceptInvitation(input) {
      const schema = acceptInvitationSchema(minPasswordLength)
      const parsed = schema.safeParse(input)
      if (!parsed.success) {
        throw new AuthError(
          parsed.error.errors[0]?.message ?? 'Validation failed',
          'VALIDATION_ERROR',
          400,
        )
      }

      try {
        const { userId } = await acceptInvitationFeature({
          rawToken: parsed.data.token,
          newPassword: parsed.data.password,
          db,
          saltRounds,
        })

        const user = await db.findUserById(userId)
        if (!user) {
          throw new AuthError('User not found', 'USER_NOT_FOUND', 404)
        }

        const publicUser = toPublicUser(user)
        const token = signJwt({ sub: user.id, email: user.email, role: user.role }, session.secret, expiresIn)
        const refreshToken = await issueRefreshToken({ userId: user.id, db, ttlMs: refreshTtlMs })

        return { user: publicUser, token, refreshToken }
      } catch (err) {
        if (err instanceof AuthError) throw err
        const message = err instanceof Error ? err.message : 'Invalid token'
        throw new AuthError(message, 'INVALID_TOKEN', 400)
      }
    },

    async refresh(rawRefreshToken) {
      if (!rawRefreshToken) {
        throw new AuthError('Refresh token is required', 'INVALID_TOKEN', 401)
      }
      let rotated: { userId: string; newRawToken: string }
      try {
        rotated = await rotateRefreshToken({ rawToken: rawRefreshToken, db, ttlMs: refreshTtlMs })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid refresh token'
        throw new AuthError(message, 'INVALID_TOKEN', 401)
      }
      const user = await db.findUserById(rotated.userId)
      if (!user) {
        throw new AuthError('User no longer exists', 'INVALID_TOKEN', 401)
      }
      const publicUser = toPublicUser(user)
      const token = signJwt({ sub: user.id, email: user.email, role: user.role }, session.secret, expiresIn)
      await callbacks.onTokenRefresh?.(publicUser)
      return { user: publicUser, token, refreshToken: rotated.newRawToken }
    },

    async revoke(rawRefreshToken) {
      if (!rawRefreshToken) return
      await revokeRefreshToken({ rawToken: rawRefreshToken, db })
    },

    async revokeAll(userId) {
      await revokeAllRefreshTokensForUser({ userId, db })
    },

    async sendMagicLink(input, { magicLinkUrl }) {
      if (!hasMagicLink) {
        throw new AuthError('magicLink feature is not enabled', 'FEATURE_DISABLED', 500)
      }
      if (!email) {
        throw new AuthError('Email provider is not configured', 'EMAIL_NOT_CONFIGURED', 500)
      }
      if (!magicLinkUrl) {
        throw new AuthError(
          'magicLinkUrl is required when the magicLink feature is enabled',
          'MISSING_URL',
          500,
        )
      }

      const parsed = sendMagicLinkSchema.safeParse(input)
      if (!parsed.success) {
        // Always return successfully to prevent enumeration
        return
      }

      // Intentionally swallow downstream errors — always 200
      try {
        await sendMagicLinkFeature({
          email: parsed.data.email,
          db,
          emailProvider: email.provider,
          from: email.from,
          magicLinkUrl,
          defaultRole,
          ...(email.templates?.magicLink ? { template: email.templates.magicLink } : {}),
        })
      } catch {
        // Swallow — no email enumeration
      }
    },

    async consumeMagicLink(input) {
      if (!hasMagicLink) {
        throw new AuthError('magicLink feature is not enabled', 'FEATURE_DISABLED', 500)
      }
      const parsed = consumeMagicLinkSchema.safeParse(input)
      if (!parsed.success) {
        throw new AuthError('Token is required', 'INVALID_TOKEN', 400)
      }

      let consumed: { user: { id: string; email: string; emailVerified: boolean; role: string; createdAt: Date; updatedAt: Date; passwordHash: string } }
      try {
        consumed = await consumeMagicLinkFeature({ rawToken: parsed.data.token, db })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid token'
        throw new AuthError(message, 'INVALID_TOKEN', 400)
      }

      const publicUser = toPublicUser(consumed.user)
      const token = signJwt(
        { sub: consumed.user.id, email: consumed.user.email, role: consumed.user.role },
        session.secret,
        expiresIn,
      )
      const refreshToken = await issueRefreshToken({ userId: consumed.user.id, db, ttlMs: refreshTtlMs })

      await callbacks.onSignIn?.(publicUser)
      return { user: publicUser, token, refreshToken }
    },

    async oauthStart(providerId, redirectUri) {
      const provider = config.oauth?.[providerId]
      if (!provider) {
        throw new AuthError(
          `OAuth provider '${providerId}' is not configured`,
          'OAUTH_PROVIDER_UNKNOWN',
          400,
        )
      }
      return startOAuth({ provider, redirectUri, secret: session.secret })
    },

    async oauthCallback(providerId, { code, state, redirectUri }) {
      const provider = config.oauth?.[providerId]
      if (!provider) {
        throw new AuthError(
          `OAuth provider '${providerId}' is not configured`,
          'OAUTH_PROVIDER_UNKNOWN',
          400,
        )
      }
      let result
      try {
        result = await completeOAuth({
          provider,
          state,
          code,
          redirectUri,
          secret: session.secret,
          db,
          defaultRole,
        })
      } catch (err) {
        // Re-wrap OAuthError-shaped errors as AuthError so callers get a consistent type.
        if (err && typeof err === 'object' && (err as { isOAuthError?: boolean }).isOAuthError) {
          const e = err as Error & { code: string; statusCode: number }
          throw new AuthError(e.message, e.code, e.statusCode)
        }
        throw err
      }

      const { user, isNewUser } = result
      const publicUser = toPublicUser(user)
      const token = signJwt(
        { sub: user.id, email: user.email, role: user.role },
        session.secret,
        expiresIn,
      )
      const refreshToken = await issueRefreshToken({ userId: user.id, db, ttlMs: refreshTtlMs })

      // Fire onSignUp if this was a brand-new user; otherwise fire onSignIn.
      if (isNewUser) {
        await callbacks.onSignUp?.(publicUser)
      } else {
        await callbacks.onSignIn?.(publicUser)
      }

      return { user: publicUser, token, refreshToken, isNewUser }
    },

    config,
  }
}
