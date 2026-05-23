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
}
