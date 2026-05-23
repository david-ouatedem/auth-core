/**
 * Core domain types for AuthCore.
 * These are the canonical shapes that adapters must produce/consume.
 */

export type TokenType =
  | 'EMAIL_VERIFICATION'
  | 'PASSWORD_RESET'
  | 'SESSION'
  | 'INVITATION'
  | 'REFRESH'

/** A user record as stored in the database. */
export interface User {
  id: string
  email: string
  passwordHash: string
  emailVerified: boolean
  role: string
  createdAt: Date
  updatedAt: Date
}

/** A token record as stored in the database. The `token` field is the hashed value. */
export interface Token {
  id: string
  userId: string
  type: TokenType
  /** SHA-256 hash of the raw token. Never the raw token itself. */
  token: string
  expiresAt: Date
  createdAt: Date
}

/** Input shape for creating a new user. */
export interface CreateUserInput {
  email: string
  passwordHash: string
  role?: string
}

/** Input shape for creating a new token. */
export interface CreateTokenInput {
  userId: string
  type: TokenType
  /** SHA-256 hash of the raw token. */
  token: string
  expiresAt: Date
}

/** Safe user shape returned to callers (no passwordHash). */
export type PublicUser = Omit<User, 'passwordHash'>

/** Configuration for the AuthCore session/JWT strategy. */
export interface SessionConfig {
  strategy: 'jwt'
  secret: string
  /** Access-token (JWT) expiry. Default: `'7d'`. With refresh tokens enabled, use a shorter value like `'15m'`. */
  expiresIn?: string
  /** Refresh-token expiry. Default: `'30d'`. */
  refreshExpiresIn?: string
  /**
   * Cookie name used when framework adapters are configured with `useCookies: true`.
   * The same name is read by middleware/guards. Defaults to `'authcore_token'`.
   * The refresh cookie uses `${cookieName}_refresh`; the CSRF cookie uses `${cookieName}_csrf`.
   */
  cookieName?: string
  /**
   * Opt-in CSRF protection (synchronizer-token pattern). When `true` AND `useCookies: true`,
   * register/login/refresh/accept-invitation set a non-httpOnly `${cookieName}_csrf` cookie.
   * Clients must echo the value back as `X-CSRF-Token` on state-changing requests
   * (POST/PUT/PATCH/DELETE). Off by default for backward compatibility.
   */
  csrf?: boolean
}

/** A custom email template — a function that renders subject/html/text from context. */
export interface EmailTemplate<TCtx> {
  (ctx: TCtx): { subject: string; html: string; text: string }
}

/** Per-template overrides on `EmailConfig.templates`. Unset entries fall back to library defaults. */
export interface EmailTemplates {
  verifyEmail?: EmailTemplate<{ email: string; link: string; ttlHours: number }>
  resetPassword?: EmailTemplate<{ email: string; link: string; ttlHours: number }>
  invitation?: EmailTemplate<{ email: string; link: string; ttlHours: number; role: string }>
}

/** Configuration for email features. */
export interface EmailConfig {
  provider: EmailAdapter
  from: string
  /**
   * Per-feature template overrides. Each entry is a function `(ctx) => { subject, html, text }`.
   * When unset, the library default templates are used.
   */
  templates?: EmailTemplates
}

/** Optional lifecycle callbacks. */
export interface AuthCallbacks {
  onSignUp?: (user: PublicUser) => void | Promise<void>
  onSignIn?: (user: PublicUser) => void | Promise<void>
  onSignOut?: (userId: string) => void | Promise<void>
  onPasswordReset?: (user: PublicUser) => void | Promise<void>
  onTokenRefresh?: (user: PublicUser) => void | Promise<void>
  onFailedLogin?: (
    email: string,
    reason: 'INVALID_CREDENTIALS' | 'EMAIL_NOT_VERIFIED',
  ) => void | Promise<void>
}

/**
 * DatabaseAdapter defines the contract that any database implementation must fulfill.
 */
export interface DatabaseAdapter {
  findUserByEmail(email: string): Promise<User | null>
  findUserById(id: string): Promise<User | null>
  createUser(data: CreateUserInput): Promise<User>
  updateUser(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User>
  createToken(data: CreateTokenInput): Promise<Token>
  findToken(rawToken: string, type: TokenType): Promise<Token | null>
  deleteToken(id: string): Promise<void>
  deleteExpiredTokens(): Promise<void>
  /**
   * Delete every token of a given type for a single user. Used by
   * `auth.revokeAll(userId)` to log a user out of every device (revokes all
   * outstanding REFRESH tokens). May also be used by feature flows to clear
   * stale verification/reset tokens.
   */
  deleteTokensByUserAndType(userId: string, type: TokenType): Promise<void>
}

/**
 * EmailAdapter defines the contract for any email provider implementation.
 */
export interface EmailAdapter {
  send(options: {
    from: string
    to: string
    subject: string
    html: string
    text: string
  }): Promise<void>
}

/** Top-level AuthCore configuration object. */
export interface AuthCoreConfig {
  db: DatabaseAdapter
  session: SessionConfig
  email?: EmailConfig
  features?: Array<'emailVerification' | 'passwordReset' | 'invitation'>
  password?: {
    minLength?: number
    saltRounds?: number
  }
  rbac?: {
    defaultRole?: string
  }
  callbacks?: AuthCallbacks
}
