import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export interface AuthMiddlewareOptions {
  /**
   * The auth cookie name. Must match `session.cookieName` on the AuthCore
   * server config. Defaults to `'authcore_token'`.
   */
  cookieName?: string
  /**
   * Paths that should be accessible without a session. Supports exact match
   * and prefix match via trailing slash. Default: `['/login', '/signup', '/']`.
   */
  publicRoutes?: string[]
  /**
   * Where to redirect unauthenticated requests. Default: `'/login'`.
   * The original path is appended as `?next=…` so the login page can return
   * the user where they were going.
   */
  loginUrl?: string
  /**
   * When `true`, prefix the original path on the redirect's `next` query param.
   * Default `true`. Set false if your login page doesn't read `?next`.
   */
  returnTo?: boolean
}

/**
 * Build a Next.js middleware that gates protected pages on the auth cookie.
 *
 * This is an **edge-safe** presence check — it only verifies the cookie exists,
 * not that the JWT inside is valid. Real verification happens in Server
 * Components / Route Handlers via {@link createServerHelpers}'s `getCurrentUser`.
 *
 * ```ts
 * // middleware.ts
 * import { createAuthMiddleware } from '@authcore/nextjs/middleware'
 *
 * export default createAuthMiddleware({
 *   publicRoutes: ['/login', '/signup', '/api/auth', '/'],
 * })
 *
 * export const config = {
 *   matcher: ['/((?!_next|favicon).*)'],
 * }
 * ```
 *
 * If you need real JWT verification at the edge, use `getCurrentUser` from
 * `@authcore/nextjs/server` inside a Server Component instead — the
 * middleware should stay fast and edge-compatible.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  const {
    cookieName = 'authcore_token',
    publicRoutes = ['/login', '/signup', '/'],
    loginUrl = '/login',
    returnTo = true,
  } = options

  return function middleware(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl

    if (isPublic(pathname, publicRoutes)) return NextResponse.next()

    const hasSession = request.cookies.get(cookieName)?.value
    if (hasSession) return NextResponse.next()

    const redirect = request.nextUrl.clone()
    redirect.pathname = loginUrl
    if (returnTo && pathname !== loginUrl) {
      redirect.searchParams.set('next', pathname)
    }
    return NextResponse.redirect(redirect)
  }
}

function isPublic(pathname: string, publicRoutes: string[]): boolean {
  for (const route of publicRoutes) {
    if (route === pathname) return true
    // Trailing slash = prefix match (e.g. '/api/auth/' matches '/api/auth/login').
    // We also allow the no-slash form to prefix-match — `/api/auth` matches
    // `/api/auth/anything`. This is the intuitive default for users.
    if (pathname === route || pathname.startsWith(`${route}/`)) return true
  }
  return false
}
