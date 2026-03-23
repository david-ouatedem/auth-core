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
  provider: EmailAdapter
  from: string
}

/** Optional lifecycle callbacks. */
export interface AuthCallbacks {
  onSignUp?: (user: PublicUser) => void | Promise<void>
  onSignIn?: (user: PublicUser) => void | Promise<void>
  onSignOut?: (userId: string) => void | Promise<void>
  onPasswordReset?: (user: PublicUser) => void | Promise<void>
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
