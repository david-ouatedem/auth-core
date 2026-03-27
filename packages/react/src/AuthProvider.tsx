import { createContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { AuthWebService } from '@authcore/core-web'
import type { AuthWebRoutesInterface, AuthResponse } from '@authcore/core-web'
import type { PublicUser } from '@authcore/types'

export interface AuthContextValue {
  user: PublicUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  signUp(email: string, password: string): Promise<AuthResponse>
  signIn(email: string, password: string): Promise<AuthResponse>
  signOut(): Promise<void>
  verifyEmail(token: string): Promise<void>
  forgotPassword(email: string): Promise<void>
  resetPassword(token: string, password: string): Promise<void>
  invite(email: string, role?: string): Promise<void>
  acceptInvitation(token: string, password: string): Promise<AuthResponse>
  refreshUser(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export interface AuthProviderProps {
  baseUrl: string
  mode?: 'api' | 'cookie'
  storageKey?: string
  persistSession?: boolean
  routes?: AuthWebRoutesInterface
  children: React.ReactNode
}

export function AuthProvider({
  baseUrl,
  mode = 'api',
  storageKey = 'authcore_token',
  persistSession = true,
  routes,
  children,
}: AuthProviderProps) {
  const service = useMemo(
    () =>
      new AuthWebService(
        {
          baseUrl,
          mode,
          persistSession,
          storageKey,
          token: '',
          user: null,
          error: null,
          isLoading: true,
          isAuthenticated: false,
        },
        routes,
      ),
    [baseUrl, mode, storageKey, persistSession, routes],
  )

  const state = useSyncExternalStore(
    (cb) => service.subscribe(cb),
    () => service.getState(),
  )

  useEffect(() => {
    service.refreshUser().catch(() => {})
  }, [service])

  const value: AuthContextValue = {
    user: state.user,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    error: state.error,
    signUp: (email, password) => service.signUp({ email, password }),
    signIn: (email, password) => service.signIn({ email, password }),
    signOut: () => service.signOut(),
    verifyEmail: (token) => service.verifyEmail(token),
    forgotPassword: (email) => service.forgotPassword(email),
    resetPassword: (token, password) => service.resetPassword(token, password),
    invite: (email, role) => service.invite(email, role),
    acceptInvitation: (token, password) => service.acceptInvitation(token, password),
    refreshUser: () => service.refreshUser(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
