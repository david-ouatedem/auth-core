import { createContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { AuthWebService } from '@authcore/core-web'
import type { AuthWebRoutesInterface, AuthResponse, AuthResponseTransformers } from '@authcore/core-web'
import type { PublicUser } from '@authcore/types'

export interface AuthContextValue<TUser extends PublicUser = PublicUser> {
  user: TUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  signUp(email: string, password: string): Promise<AuthResponse<TUser>>
  signIn(email: string, password: string): Promise<AuthResponse<TUser>>
  signOut(): Promise<void>
  verifyEmail(token: string): Promise<void>
  forgotPassword(email: string): Promise<void>
  resetPassword(token: string, password: string): Promise<void>
  invite(email: string, role?: string): Promise<void>
  acceptInvitation(token: string, password: string): Promise<AuthResponse<TUser>>
  refreshUser(): Promise<void>
}

// Context is typed with the base PublicUser. useAuth<TUser>() narrows via a type assertion,
// the same opt-in pattern used by next-auth's session augmentation.
export const AuthContext = createContext<AuthContextValue<PublicUser> | null>(null)

export interface AuthProviderProps<TUser extends PublicUser = PublicUser> {
  baseUrl: string
  mode?: 'api' | 'cookie'
  storageKey?: string
  persistSession?: boolean
  routes?: AuthWebRoutesInterface
  children: React.ReactNode
  /**
   * Map your backend's sign-in / sign-up / accept-invitation response to `{ user, token? }`.
   * Use this when your backend returns a different JSON shape, e.g. `{ data: { user }, access_token }`.
   */
  transformAuthResponse?: AuthResponseTransformers<TUser>['transformAuthResponse']
  /**
   * Map your backend's /me response to a user object.
   * Use this when your backend returns a different shape for the current-user endpoint.
   * Return any shape you want — pair with `useAuth<YourUserType>()` to get it fully typed.
   */
  transformUser?: AuthResponseTransformers<TUser>['transformUser']
  /**
   * Map your backend's error body to an error message string.
   * Use this when your backend returns errors as `{ message }`, `{ errors: [] }`, etc.
   */
  transformError?: AuthResponseTransformers<TUser>['transformError']
  /**
   * Provide a custom HTTP client (e.g. an Axios adapter) to replace the built-in fetch client.
   * When supplied, `baseUrl`, `mode`, and `storageKey` are ignored for request handling.
   */
  httpClient?: { get<T>(path: string): Promise<T>; post<T>(path: string, body?: unknown): Promise<T> }
}

export function AuthProvider<TUser extends PublicUser = PublicUser>({
  baseUrl,
  mode = 'api',
  storageKey = 'authcore_token',
  persistSession = true,
  routes,
  children,
  transformAuthResponse,
  transformUser,
  transformError,
  httpClient,
}: AuthProviderProps<TUser>) {
  const service = useMemo(
    () =>
      new AuthWebService<TUser>(
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
        {
          ...(httpClient ? { httpClient } : {}),
          transformers: {
            ...(transformAuthResponse ? { transformAuthResponse } : {}),
            ...(transformUser ? { transformUser } : {}),
            ...(transformError ? { transformError } : {}),
          },
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseUrl, mode, storageKey, persistSession, routes],
  )

  const state = useSyncExternalStore(
    (cb) => service.subscribe(cb),
    () => service.getState(),
  )

  useEffect(() => {
    service.refreshUser().catch(() => {})
  }, [service])

  const value: AuthContextValue<TUser> = {
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

  return (
    <AuthContext.Provider value={value as AuthContextValue<PublicUser>}>
      {children}
    </AuthContext.Provider>
  )
}
