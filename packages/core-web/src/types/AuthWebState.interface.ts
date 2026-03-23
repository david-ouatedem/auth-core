import type { PublicUser } from '@authcore/types'

export interface AuthWebStateInterface {
    isLoading: boolean;
    persistSession: boolean;
    storageKey: string
    isAuthenticated: boolean;
    user: PublicUser | null;
    error: string | null;
    token: string | null;
    baseUrl: string;
    mode: 'api' | 'cookie';
}