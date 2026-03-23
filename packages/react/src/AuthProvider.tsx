import { createContext, useContext, useSyncExternalStore, useMemo } from 'react';
import { AuthWebService, type PublicUser, type AuthWebRoutesInterface } from '@authcore/core-web';

export interface AuthContextValue {
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
}

export const AuthContext = createContext<AuthContextValue | null>(null);
export interface AuthProviderProps {
    baseUrl: string
    mode?: 'api' | 'cookie'
    storageKey?: string
    persistSession?: boolean
    routes?: AuthWebRoutesInterface
    children: React.ReactNode
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
        }
    }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}