import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PublicUser } from '@authcore/core'
import { createAuthClient } from './client.js'

export interface AuthContextValue {
  user: PublicUser | null
  isLoading: boolean
  isAuthenticated: boolean
  signUp(email: string, password: string): Promise<PublicUser>
  signIn(email: string, password: string): Promise<PublicUser>
  signOut(): Promise<void>
  verifyEmail(token: string): Promise<void>
  forgotPassword(email: string): Promise<void>
  resetPassword(token: string, password: string): Promise<void>
  refreshUser(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export interface AuthProviderProps {
  baseUrl: string
  mode?: 'api' | 'cookie'
  storageKey?: string
  persistSession?: boolean
  routes?: {
    register?: string
    login?: string
    logout?: string
    me?: string
    verifyEmail?: string
    forgotPassword?: string
    resetPassword?: string
  }
  children: React.ReactNode
}

export function AuthProvider({
  baseUrl,
  mode = 'api',
  storageKey = 'authcore_token',
  persistSession = true,
  routes = {},
  children,
}: AuthProviderProps) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const tokenRef = useRef<string | null>(null)

  const paths = useMemo(() => ({
    register: routes.register ?? '/register',
    login: routes.login ?? '/login',
    logout: routes.logout ?? '/logout',
    me: routes.me ?? '/me',
    verifyEmail: routes.verifyEmail ?? '/verify-email',
    forgotPassword: routes.forgotPassword ?? '/forgot-password',
    resetPassword: routes.resetPassword ?? '/reset-password',
  }), [routes])

  const client = useMemo(
    () => createAuthClient({ baseUrl, mode, getToken: () => tokenRef.current }),
    [baseUrl, mode],
  )

  const setToken = useCallback((token: string | null) => {
    tokenRef.current = token
    if (mode === 'api' && persistSession) {
      if (token) {
        localStorage.setItem(storageKey, token)
      } else {
        localStorage.removeItem(storageKey)
      }
    }
  }, [mode, persistSession, storageKey])

  // Restore session on mount
  useEffect(() => {
    let cancelled = false

    async function restore() {
      try {
        if (mode === 'api' && persistSession) {
          const stored = localStorage.getItem(storageKey)
          if (stored) {
            tokenRef.current = stored
          }
        }

        // Only attempt /me if we have a token (api mode) or are in cookie mode
        if (mode === 'cookie' || tokenRef.current) {
          const me = await client.get<PublicUser>(paths.me)
          if (!cancelled) setUser(me)
        }
      } catch {
        // No valid session — clear stale token
        if (!cancelled) setToken(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void restore()
    return () => { cancelled = true }
  }, [client, mode, paths.me, persistSession, storageKey, setToken])

  const signUp = useCallback(async (email: string, password: string): Promise<PublicUser> => {
    setIsLoading(true)
    try {
      const { user, token } = await client.post<{ user: PublicUser; token?: string }>(
        paths.register,
        { email, password },
      )
      if (token) setToken(token)
      setUser(user)
      return user
    } finally {
      setIsLoading(false)
    }
  }, [client, paths.register, setToken])

  const signIn = useCallback(async (email: string, password: string): Promise<PublicUser> => {
    setIsLoading(true)
    try {
      const { user, token } = await client.post<{ user: PublicUser; token?: string }>(
        paths.login,
        { email, password },
      )
      if (token) setToken(token)
      setUser(user)
      return user
    } catch (err) {
      setToken(null)
      setUser(null)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [client, paths.login, setToken])

  const signOut = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      await client.post(paths.logout)
      setToken(null)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [client, paths.logout, setToken])

  const verifyEmailFn = useCallback(async (token: string): Promise<void> => {
    setIsLoading(true)
    try {
      await client.post(paths.verifyEmail, { token })
    } finally {
      setIsLoading(false)
    }
  }, [client, paths.verifyEmail])

  const forgotPasswordFn = useCallback(async (email: string): Promise<void> => {
    setIsLoading(true)
    try {
      await client.post(paths.forgotPassword, { email })
    } finally {
      setIsLoading(false)
    }
  }, [client, paths.forgotPassword])

  const resetPasswordFn = useCallback(async (token: string, password: string): Promise<void> => {
    setIsLoading(true)
    try {
      await client.post(paths.resetPassword, { token, password })
    } finally {
      setIsLoading(false)
    }
  }, [client, paths.resetPassword])

  const refreshUser = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      const me = await client.get<PublicUser>(paths.me)
      setUser(me)
    } catch (err) {
      setToken(null)
      setUser(null)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [client, paths.me, setToken])
  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isAuthenticated: user !== null,
    signUp,
    signIn,
    signOut,
    verifyEmail: verifyEmailFn,
    forgotPassword: forgotPasswordFn,
    resetPassword: resetPasswordFn,
    refreshUser,
  }), [user, isLoading, signUp, signIn, signOut, verifyEmailFn, forgotPasswordFn, resetPasswordFn, refreshUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
