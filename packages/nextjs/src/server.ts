import { cookies } from 'next/headers'
import type { AuthCore } from '@authcore/core'
import type { PublicUser } from '@authcore/types'

export interface NextAuthServerHelpers<TUser extends PublicUser = PublicUser> {
  /**
   * Return the currently signed-in user, or `null` if no valid session cookie.
   * Works inside Server Components, Route Handlers, and Server Actions.
   *
   * ```tsx
   * // app/dashboard/page.tsx
   * import { getCurrentUser } from '@/lib/auth-helpers'
   * export default async function Dashboard() {
   *   const user = await getCurrentUser()
   *   if (!user) redirect('/login')
   *   return <h1>{user.email}</h1>
   * }
   * ```
   */
  getCurrentUser(): Promise<TUser | null>
  /**
   * Same as {@link getCurrentUser} but throws when there is no session.
   * Useful when you've already redirected unauthenticated requests via middleware
   * and want a non-null return shape in your component.
   */
  requireUser(): Promise<TUser>
}

/**
 * Build server-side auth helpers tied to a specific AuthCore instance.
 *
 * Read the cookie via Next.js's `cookies()` (works in Server Components, Route
 * Handlers, and Server Actions) and verifies the JWT with `auth.verifyToken`.
 *
 * Pass the same instance you used to create the route handler:
 *
 * ```ts
 * // lib/auth.ts
 * import { createAuth } from '@authcore/core'
 * import { createNextAuthHandler, createServerHelpers } from '@authcore/nextjs'
 *
 * export const auth = createAuth({ ... })
 * export const { GET, POST } = createNextAuthHandler(auth, { ... })
 * export const { getCurrentUser, requireUser } = createServerHelpers(auth)
 * ```
 */
export function createServerHelpers<TUser extends PublicUser = PublicUser>(
  auth: AuthCore,
): NextAuthServerHelpers<TUser> {
  const cookieName = auth.config.session.cookieName ?? 'authcore_token'

  async function getCurrentUser(): Promise<TUser | null> {
    // `cookies()` is sync in Next 13/14 and async in Next 15. `await` is identity
    // on non-Promise values, so this works across versions.
    const store = await cookies()
    const token = store.get(cookieName)?.value
    if (!token) return null
    const user = await auth.verifyToken(token)
    return user as TUser | null
  }

  async function requireUser(): Promise<TUser> {
    const user = await getCurrentUser()
    if (!user) {
      throw new Error('requireUser: no authenticated user. Did the middleware run?')
    }
    return user
  }

  return { getCurrentUser, requireUser }
}
