import type { PublicUser } from '@authcore/types'
import type { AuthWebStateInterface } from './AuthWebState.interface.js'

export interface AuthResponse {
  user: PublicUser
  token?: string
}

export interface AuthWebServiceResponseInterface {
  getState(): AuthWebStateInterface
  subscribe(listener: () => void): () => void
  notifyListeners(): void

  signIn(params: { email: string; password: string }): Promise<AuthResponse>
  signUp(params: { email: string; password: string }): Promise<AuthResponse>
  signOut(): Promise<void>
  verifyEmail(token: string): Promise<void>
  forgotPassword(email: string): Promise<void>
  resetPassword(token: string, password: string): Promise<void>
  invite(email: string, role?: string): Promise<void>
  acceptInvitation(token: string, password: string): Promise<AuthResponse>
  refreshUser(): Promise<void>
}
