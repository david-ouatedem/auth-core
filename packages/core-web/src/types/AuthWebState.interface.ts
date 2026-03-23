import type { PublicUser } from '@authcore/core'

export interface AuthWebStateInterface {
    isLoading: boolean;
    persistSession: boolean;
    storageKey: string
    isAuthenticated: boolean;
    user: PublicUser | null;
    error: string | null;
    token?: string
    baseUrl: string;
    mode: 'api' | 'cookie';
}