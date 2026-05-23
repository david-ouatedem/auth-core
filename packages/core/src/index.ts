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
export { startOAuth, completeOAuth } from './features/oauth.js'
export { createGoogleProvider } from './oauth/google.js'
export type { GoogleProviderConfig } from './oauth/google.js'
export { createGithubProvider } from './oauth/github.js'
export type { GithubProviderConfig } from './oauth/github.js'
export { createMicrosoftProvider } from './oauth/microsoft.js'
export type { MicrosoftProviderConfig } from './oauth/microsoft.js'
export { createDiscordProvider } from './oauth/discord.js'
export type { DiscordProviderConfig } from './oauth/discord.js'
export { createAppleProvider, generateAppleClientSecret } from './oauth/apple.js'
export type { AppleProviderConfig } from './oauth/apple.js'

// Auth factory
export { createAuth, AuthError } from './auth.js'
export type { AuthCore } from './auth.js'

export * from '@authcore/types'
