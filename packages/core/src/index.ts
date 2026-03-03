// Types
export type {
  User,
  Token,
  TokenType,
  CreateUserInput,
  CreateTokenInput,
  PublicUser,
  SessionConfig,
  EmailConfig,
  AuthCallbacks,
  AuthCoreConfig,
} from './types.js'

// Adapter interfaces
export type { DatabaseAdapter } from './adapters/database.interface.js'
export type { EmailAdapter } from './adapters/email.interface.js'

// Utilities
export { hashPassword, verifyPassword } from './utils/password.js'
export {
  generateOpaqueToken,
  hashToken,
  safeCompareTokens,
  signJwt,
  verifyJwt,
} from './utils/token.js'
export type { JwtPayload } from './utils/token.js'
export {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './utils/validation.js'
export type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from './utils/validation.js'

// Features
export { createEmailVerification, verifyEmail } from './features/emailVerification.js'
export { createPasswordReset, resetPassword } from './features/passwordReset.js'

// Auth factory
export { createAuth, AuthError } from './auth.js'
export type { AuthCore } from './auth.js'
