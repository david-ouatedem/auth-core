// Utilities
export { hashPassword, verifyPassword } from './utils/password.js'
export {
  generateOpaqueToken,
  generateCsrfToken,
  generatePkceVerifier,
  pkceChallenge,
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
  inviteSchema,
  acceptInvitationSchema,
} from './utils/validation.js'
export type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  VerifyEmailInput,
  InviteInput,
  AcceptInvitationInput,
} from './utils/validation.js'

// Features
export { createEmailVerification, verifyEmail } from './features/emailVerification.js'
export { createPasswordReset, resetPassword } from './features/passwordReset.js'
export { createInvitation, acceptInvitation } from './features/invitation.js'
export {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
} from './features/refresh.js'
export {
  defaultVerifyEmailTemplate,
  defaultResetPasswordTemplate,
  defaultInvitationTemplate,
} from './features/templates.js'

// Auth factory
export { createAuth, AuthError } from './auth.js'
export type { AuthCore } from './auth.js'

export * from '@authcore/types'
