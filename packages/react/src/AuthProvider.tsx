import { createContext, useContext, useSyncExternalStore, useMemo } from 'react';
import { AuthWebService, type PublicUser, type AuthWebRoutesInterface } from '@authcore/core-web';

export interface AuthContextValue {
<<<<<<< HEAD
    user: PublicUser | null
    isLoading: boolean
    isAuthenticated: boolean
    signUp<T extends { user: PublicUser; token?: string }>(email: string, password: string): Promise<T | undefined>
    signIn<T extends { user: PublicUser; token?: string }>(email: string, password: string): Promise<T | undefined>
    signOut(): Promise<void>
    verifyEmail(token: string): Promise<void>
    forgotPassword(email: string): Promise<void>
    resetPassword(token: string, password: string): Promise<void>
    refreshUser(): Promise<void>
=======
  user: PublicUser | null
  isLoading: boolean
  isAuthenticated: boolean
  signUp(email: string, password: string): Promise<PublicUser>
  signIn(email: string, password: string): Promise<PublicUser>
  signOut(): Promise<void>
  verifyEmail(token: string): Promise<void>
  forgotPassword(email: string): Promise<void>
  resetPassword(token: string, password: string): Promise<void>
  invite(email: string, role?: string): Promise<void>
  acceptInvitation(token: string, password: string): Promise<PublicUser>
  refreshUser(): Promise<void>
>>>>>>> 116f5d72c23d0a4642a3e7f258f0ec2a542bd200
}

export const AuthContext = createContext<AuthContextValue | null>(null);
export interface AuthProviderProps {
<<<<<<< HEAD
    baseUrl: string
    mode?: 'api' | 'cookie'
    storageKey?: string
    persistSession?: boolean
    routes?: AuthWebRoutesInterface
    children: React.ReactNode
=======
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
    invite?: string
    acceptInvitation?: string
  }
  children: React.ReactNode
>>>>>>> 116f5d72c23d0a4642a3e7f258f0ec2a542bd200
}
export const AuthProvider = ({ baseUrl,
    mode = 'api',
    storageKey = 'authcore_token',
    persistSession = true,
    routes,
    children }: AuthProviderProps) => {
    const webCoreInstance = useMemo(() => new AuthWebService({
        baseUrl,
        mode,
        persistSession,
        storageKey,
        token: '',
        user: null,
        error: null,
        isLoading: false,
        isAuthenticated: false,
    }, routes), [baseUrl, mode, storageKey, persistSession, routes]);

    const state = useSyncExternalStore(
        (callback) => webCoreInstance.subscribe(callback),
        () => webCoreInstance.getState()
    );

<<<<<<< HEAD
    return <AuthContext.Provider value={{
        ...state,
        signIn: async <T extends { user: PublicUser; token?: string }>(email: string, password: string) => {
            return webCoreInstance.signIn<T>({ email, password });
        },
        signUp: async <T extends { user: PublicUser; token?: string }>(email: string, password: string) => {
            return webCoreInstance.signUp<T>({ email, password });
        },
        signOut: async () => {
            return webCoreInstance.signOut();
        },
        verifyEmail: async (token: string) => {
            return webCoreInstance.verifyEmail(token);
        },
        forgotPassword: async (email: string) => {
            return webCoreInstance.forgotPassword(email);
        },
        resetPassword: async (token: string, password: string) => {
            return webCoreInstance.resetPassword(token, password);
        },
        refreshUser: async () => {
            return webCoreInstance.refreshUser();
=======
  const paths = useMemo(() => ({
    register: routes.register ?? '/register',
    login: routes.login ?? '/login',
    logout: routes.logout ?? '/logout',
    me: routes.me ?? '/me',
    verifyEmail: routes.verifyEmail ?? '/verify-email',
    forgotPassword: routes.forgotPassword ?? '/forgot-password',
    resetPassword: routes.resetPassword ?? '/reset-password',
    invite: routes.invite ?? '/invite',
    acceptInvitation: routes.acceptInvitation ?? '/accept-invitation',
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
>>>>>>> 116f5d72c23d0a4642a3e7f258f0ec2a542bd200
        }
    }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
<<<<<<< HEAD
    return context;
}
=======

    void restore()
    return () => { cancelled = true }
  }, [client, mode, paths.me, persistSession, storageKey, setToken])

  const signUp = useCallback(async (email: string, password: string): Promise<PublicUser> => {
    const res = await client.post<{ user: PublicUser; token?: string }>(
      paths.register,
      { email, password },
    )
    if (res.token) setToken(res.token)
    setUser(res.user)
    return res.user
  }, [client, paths.register, setToken])

  const signIn = useCallback(async (email: string, password: string): Promise<PublicUser> => {
    const res = await client.post<{ user: PublicUser; token?: string }>(
      paths.login,
      { email, password },
    )
    if (res.token) setToken(res.token)
    setUser(res.user)
    return res.user
  }, [client, paths.login, setToken])

  const signOut = useCallback(async (): Promise<void> => {
    await client.post(paths.logout)
    setToken(null)
    setUser(null)
  }, [client, paths.logout, setToken])

  const verifyEmailFn = useCallback(async (token: string): Promise<void> => {
    await client.post(paths.verifyEmail, { token })
  }, [client, paths.verifyEmail])

  const forgotPasswordFn = useCallback(async (email: string): Promise<void> => {
    await client.post(paths.forgotPassword, { email })
  }, [client, paths.forgotPassword])

  const resetPasswordFn = useCallback(async (token: string, password: string): Promise<void> => {
    await client.post(paths.resetPassword, { token, password })
  }, [client, paths.resetPassword])

  const inviteFn = useCallback(async (email: string, role?: string): Promise<void> => {
    await client.post(paths.invite, { email, role })
  }, [client, paths.invite])

  const acceptInvitationFn = useCallback(async (token: string, password: string): Promise<PublicUser> => {
    const res = await client.post<{ user: PublicUser; token?: string }>(
      paths.acceptInvitation,
      { token, password },
    )
    if (res.token) setToken(res.token)
    setUser(res.user)
    return res.user
  }, [client, paths.acceptInvitation, setToken])

  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const me = await client.get<PublicUser>(paths.me)
      setUser(me)
    } catch {
      setToken(null)
      setUser(null)
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
    invite: inviteFn,
    acceptInvitation: acceptInvitationFn,
    refreshUser,
  }), [user, isLoading, signUp, signIn, signOut, verifyEmailFn, forgotPasswordFn, resetPasswordFn, inviteFn, acceptInvitationFn, refreshUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
>>>>>>> 116f5d72c23d0a4642a3e7f258f0ec2a542bd200
