import type { Request, Response, NextFunction } from 'express'
import type { AuthCore } from '@authcore/core'
import type { PublicUser } from '@authcore/types'

// Augment Express Request type to include `user`
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser
    }
  }
}

/**
 * Extract a Bearer token from the Authorization header or an auth cookie.
 */
function extractToken(req: Request, cookieName: string): string | null {
  const authHeader = req.headers['authorization']
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  // Cookie-based (monorepo mode)
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[cookieName]
  return cookieToken ?? null
}

/**
 * Create the authentication middleware.
 * Attaches `req.user` if the token is valid.
 * Returns 401 if no token is provided or the token is invalid.
 */
export function createAuthMiddleware(auth: AuthCore, cookieName = 'authcore_token') {
  return async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = extractToken(req, cookieName)

    if (!token) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const user = await auth.verifyToken(token)

    if (!user) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    req.user = user
    next()
  }
}

/**
 * Optional middleware that attaches `req.user` if a valid token is present,
 * but does NOT reject unauthenticated requests. Useful for routes that behave
 * differently based on auth state.
 */
export function createOptionalAuthMiddleware(auth: AuthCore, cookieName = 'authcore_token') {
  return async function optionalAuthMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = extractToken(req, cookieName)

    if (token) {
      const user = await auth.verifyToken(token)
      if (user) {
        req.user = user
      }
    }

    next()
  }
}
