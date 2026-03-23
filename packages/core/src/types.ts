/**
 * Core domain types for AuthCore.
 * These are the canonical shapes that adapters must produce/consume.
 */

export type TokenType = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'SESSION' | 'INVITATION'

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
  expiresIn?: string
}

/** Configuration for email features. */
export interface EmailConfig {
  provider: import('./adapters/email.interface.js').EmailAdapter
  from: string
}

/** Optional lifecycle callbacks. */
export interface AuthCallbacks {
  onSignUp?: (user: PublicUser) => void | Promise<void>
  onSignIn?: (user: PublicUser) => void | Promise<void>
  onSignOut?: (userId: string) => void | Promise<void>
  onPasswordReset?: (user: PublicUser) => void | Promise<void>
}

/** Top-level AuthCore configuration object. */
export interface AuthCoreConfig {
  db: import('./adapters/database.interface.js').DatabaseAdapter
  session: SessionConfig
  email?: EmailConfig
  features?: Array<'emailVerification' | 'passwordReset' | 'invitation'>
  mode?: 'api' | 'monorepo' | 'auto'
  password?: {
    minLength?: number
    saltRounds?: number
  }
  rbac?: {
    defaultRole?: string
  }
  callbacks?: AuthCallbacks
}
