import { useContext } from 'react'
import { AuthContext } from './AuthProvider.js'
import type { AuthContextValue } from './AuthProvider.js'
import type { PublicUser } from '@authcore/types'

/**
 * Access the AuthCore authentication context.
 *
 * Must be called inside an `<AuthProvider>`.
 *
 * Pass a type parameter to access fields you added via `transformUser` on `<AuthProvider>`:
 *
 * ```tsx
 * interface MyUser extends PublicUser {
 *   avatarUrl: string
 *   displayName: string
 * }
 *
 * const { user } = useAuth<MyUser>()
 * // user.avatarUrl and user.displayName are fully typed
 * ```
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
export function useAuth<TUser extends PublicUser = PublicUser>(): AuthContextValue<TUser> {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return context as AuthContextValue<TUser>
}
