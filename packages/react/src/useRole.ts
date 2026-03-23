import { useAuth } from './useAuth.js'

/**
 * Returns the current user's role, or null if not authenticated.
 */
export function useRole(): string | null {
  const { user } = useAuth()
  return user?.role ?? null
}

/**
 * Returns true if the current user has one of the specified roles.
 * Returns false if the user is not authenticated.
 */
export function useHasRole(roles: string | string[]): boolean {
  const role = useRole()
  if (!role) return false
  const allowed = Array.isArray(roles) ? roles : [roles]
  return allowed.includes(role)
}
