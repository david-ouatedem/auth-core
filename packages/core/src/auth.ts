import type { AuthCoreConfig, PublicUser } from './types.js'
import { hashPassword, verifyPassword } from './utils/password.js'
import { signJwt, verifyJwt, generateOpaqueToken, hashToken } from './utils/token.js'
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
  register(input: unknown): Promise<{ user: PublicUser; token: string }>

  /**
   * Authenticate a user with email/password.
   * @throws AuthError on invalid credentials (401)
   */
  login(input: unknown): Promise<{ user: PublicUser; token: string }>

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
   * Initiate password reset. Always returns successfully (prevents enumeration).
   */
  forgotPassword(input: unknown): Promise<void>

  /**
   * Complete password reset using the raw token.
   * @throws AuthError if token is invalid or expired (400)
   */
  resetPassword(input: unknown): Promise<void>
}

function toPublicUser(user: {
  id: string
  email: string
  emailVerified: boolean
  createdAt: Date
  updatedAt: Date
  passwordHash: string
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
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
  const { db, session, email, features = [], password: pwConfig = {}, callbacks = {} } = config
  const saltRounds = pwConfig.saltRounds ?? 12
  const minPasswordLength = pwConfig.minLength ?? 8
  const expiresIn = session.expiresIn ?? '7d'

  const hasEmailVerification = features.includes('emailVerification')
  const hasPasswordReset = features.includes('passwordReset')

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
      const user = await db.createUser({ email: userEmail, passwordHash })
      const publicUser = toPublicUser(user)

      const token = signJwt({ sub: user.id, email: user.email }, session.secret, expiresIn)

      await callbacks.onSignUp?.(publicUser)

      return { user: publicUser, token }
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
        throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
      }

      const valid = await verifyPassword(password, user.passwordHash)
      if (!valid) {
        throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401)
      }

      if (hasEmailVerification && !user.emailVerified) {
        throw new AuthError(
          'Please verify your email address before signing in',
          'EMAIL_NOT_VERIFIED',
          403,
        )
      }

      const publicUser = toPublicUser(user)
      const token = signJwt({ sub: user.id, email: user.email }, session.secret, expiresIn)

      await callbacks.onSignIn?.(publicUser)

      return { user: publicUser, token }
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

    async forgotPassword(input) {
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

      // Intentionally swallow errors — always return 200
      try {
        await createPasswordReset({
          email: parsed.data.email,
          db,
          emailProvider: email.provider,
          from: email.from,
          resetUrl: `${session.secret}/reset-password`, // overridden by framework adapter
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
  }
}
