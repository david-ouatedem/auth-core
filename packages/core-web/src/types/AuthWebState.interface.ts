import type { PublicUser } from '@authcore/types'

export interface AuthWebStateInterface<TUser extends PublicUser = PublicUser> {
  isLoading: boolean
  persistSession: boolean
  storageKey: string
  isAuthenticated: boolean
  user: TUser | null
  error: string | null
  token: string | null
  baseUrl: string
  mode: 'api' | 'cookie'
}
