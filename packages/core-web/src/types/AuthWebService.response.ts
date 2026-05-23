import type { PublicUser } from '@authcore/types'
import type { AuthWebStateInterface } from './AuthWebState.interface.js'

export interface AuthResponse<TUser extends PublicUser = PublicUser> {
  user: TUser
  token?: string
  refreshToken?: string
}

export interface AuthWebServiceResponseInterface<TUser extends PublicUser = PublicUser> {
  getState(): AuthWebStateInterface<TUser>
  subscribe(listener: () => void): () => void
  notifyListeners(): void

  signIn(params: { email: string; password: string }): Promise<AuthResponse<TUser>>
  signUp(params: { email: string; password: string }): Promise<AuthResponse<TUser>>
  signOut(): Promise<void>
  verifyEmail(token: string): Promise<void>
  forgotPassword(email: string): Promise<void>
  resetPassword(token: string, password: string): Promise<void>
  invite(email: string, role?: string): Promise<void>
  acceptInvitation(token: string, password: string): Promise<AuthResponse<TUser>>
  refreshUser(): Promise<void>
  /** Exchange the current refresh token for a new JWT (+ rotated refresh token). */
  refresh(): Promise<AuthResponse<TUser>>
  /** Revoke the current refresh token on the server and clear local state. */
  revokeSession(): Promise<void>
  /**
   * Build the full OAuth start URL for a provider. The user must be navigated to
   * this URL (full-page redirect) so the browser follows the provider's redirect chain.
   */
  oauthStartUrl(providerId: string): string
  /**
   * Convenience: navigate the current window to {@link oauthStartUrl}.
   * No-op in non-browser environments.
   */
  signInWithProvider(providerId: string): void
  /**
   * Call this on your OAuth callback landing page (the URL the server redirects to
   * after a successful OAuth flow). Populates auth state and clears any URL fragment
   * the server included.
   *
   * - Cookie mode: cookies are already set; this fetches `/me`.
   * - API mode: reads `#token=...&refreshToken=...` from the URL fragment (server must
   *   be configured with `oauthSuccessRedirect` for this to work), then fetches `/me`.
   */
  handleOAuthCallback(): Promise<void>
}
