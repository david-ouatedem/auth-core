import type { PublicUser } from '@authcore/types'

export interface AuthWebStateInterface<TUser extends PublicUser = PublicUser> {
  isLoading: boolean
  persistSession: boolean
  storageKey: string
  isAuthenticated: boolean
  user: TUser | null
  error: string | null
  token: string | null
  /**
   * Refresh token kept in memory. In `api` mode with `persistSession: true`,
   * the service mirrors it to `localStorage` under `${storageKey}_refresh`.
   * In `cookie` mode the browser carries it as an httpOnly cookie and this
   * field stays empty.
   */
  refreshToken: string | null
  baseUrl: string
  mode: 'api' | 'cookie'
}
