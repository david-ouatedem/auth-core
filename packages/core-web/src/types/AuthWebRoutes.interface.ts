export interface AuthWebRoutesInterface {
  register?: string
  login?: string
  logout?: string
  me?: string
  verifyEmail?: string
  forgotPassword?: string
  resetPassword?: string
  invite?: string
  acceptInvitation?: string
  refresh?: string
  revoke?: string
  /** OAuth start path with `:provider` placeholder. Default: '/oauth/:provider'. */
  oauthStart?: string
  /** Magic-link send path. Default: '/magic-link'. */
  sendMagicLink?: string
  /** Magic-link consume path. Default: '/magic-link/consume'. */
  consumeMagicLink?: string
  /** 2FA setup (authed). Default: '/2fa/setup'. */
  setupTwoFactor?: string
  /** 2FA enable confirmation (authed). Default: '/2fa/enable'. */
  enableTwoFactor?: string
  /** 2FA disable (authed). Default: '/2fa/disable'. */
  disableTwoFactor?: string
  /** 2FA verify TOTP code. Default: '/2fa/verify'. */
  verifyTwoFactor?: string
  /** 2FA recovery-code use. Default: '/2fa/recovery'. */
  useRecoveryCode?: string
}
