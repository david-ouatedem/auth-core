import { useEffect } from 'react'
import { useAuth } from './useAuth.js'

export interface ProtectedRouteProps {
  children: React.ReactNode
  /** Rendered while the auth state is loading. Defaults to `null`. */
  fallback?: React.ReactNode
  /** Called when the user is not authenticated. Use this to redirect. */
  onUnauthenticated?: () => void
}

/**
 * Guard component that only renders children when the user is authenticated.
 *
 * @example
 * ```tsx
 * <ProtectedRoute
 *   fallback={<p>Loading...</p>}
 *   onUnauthenticated={() => navigate('/login')}
 * >
 *   <Dashboard />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
  children,
  fallback = null,
  onUnauthenticated,
}: ProtectedRouteProps) {
  const { isLoading, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      onUnauthenticated?.()
    }
  }, [isLoading, isAuthenticated, onUnauthenticated])

  if (isLoading) return <>{fallback}</>
  if (!isAuthenticated) return null

  return <>{children}</>
}
