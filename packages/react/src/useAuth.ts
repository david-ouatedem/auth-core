import { useContext } from 'react'
import { AuthContext } from './AuthProvider.js'
import type { AuthContextValue } from './AuthProvider.js'

/**
 * Access the AuthCore authentication context.
 *
 * Must be called inside an `<AuthProvider>`.
 *
 * @example
 * ```tsx
 * function LoginPage() {
 *   const { signIn, isAuthenticated } = useAuth()
 *
 *   if (isAuthenticated) return <p>Already signed in</p>
 *
 *   return (
 *     <button onClick={() => signIn('user@example.com', 'password')}>
 *       Sign In
 *     </button>
 *   )
 * }
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return context
}
