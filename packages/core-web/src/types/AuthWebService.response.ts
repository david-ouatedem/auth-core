import type { PublicUser } from '@authcore/types'
import type { AuthWebStateInterface } from './AuthWebState.interface.js'

export interface AuthResponse<TUser extends PublicUser = PublicUser> {
  user: TUser
  token?: string
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
}
