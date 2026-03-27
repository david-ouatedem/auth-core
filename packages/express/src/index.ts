import { createAuth as createCoreAuth } from '@authcore/core'
import type { AuthCoreConfig } from '@authcore/types'
import { createAuthRouter } from './router.js'
import type { RouterConfig } from './router.js'
import { createAuthMiddleware, createOptionalAuthMiddleware } from './middleware.js'
import type { Router, RequestHandler } from 'express'

export type { RouterConfig }

/**
 * The Express AuthCore instance — wraps the core auth logic with Express-specific
 * routing and middleware.
 */
export interface ExpressAuth {
  /**
   * Returns an Express Router with all auth routes mounted.
   * Mount it with: `app.use('/auth', auth.router())`
   */
  router(config?: RouterConfig): Router

  /**
   * Returns an Express middleware that validates the JWT (or cookie) and
   * attaches `req.user`. Returns 401 on failure.
   *
   * Use it to protect individual routes:
   * `app.get('/dashboard', auth.middleware(), handler)`
   */
  middleware(): RequestHandler

  /**
   * Returns a middleware that optionally attaches `req.user` if a valid token
   * is present, but does NOT reject unauthenticated requests.
   */
  optionalMiddleware(): RequestHandler

  /**
   * Returns a middleware that checks `req.user.role` against the allowed roles.
   * Must be used after `auth.middleware()`.
   * Returns 403 if the user's role is not in the allowed list.
   *
   * @example
   * `app.get('/admin', auth.middleware(), auth.requireRole('admin'), handler)`
   * `app.get('/staff', auth.middleware(), auth.requireRole('admin', 'editor'), handler)`
   */
  requireRole(...roles: string[]): RequestHandler
}

/**
 * Create an Express-specific AuthCore instance.
 *
 * @example
 * ```ts
 * import express from 'express'
 * import { createAuth } from '@authcore/express'
 * import { prismaAdapter } from '@authcore/prisma-adapter'
 *
 * const auth = createAuth({
 *   db: prismaAdapter(prisma),
 *   session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
 * })
 *
 * const app = express()
 * app.use(express.json())
 * app.use('/auth', auth.router())
 * app.get('/dashboard', auth.middleware(), (req, res) => {
 *   res.json({ user: req.user })
 * })
 * ```
 */
export function createAuth(config: AuthCoreConfig): ExpressAuth {
  const core = createCoreAuth(config)

  return {
    router(routerConfig?: RouterConfig) {
      return createAuthRouter(core, routerConfig)
    },

    middleware() {
      return createAuthMiddleware(core) as RequestHandler
    },

    optionalMiddleware() {
      return createOptionalAuthMiddleware(core) as RequestHandler
    },

    requireRole(...roles: string[]) {
      return ((req, res, next) => {
        const user = req.user
        if (!user) {
          res.status(401).json({ error: 'Authentication required' })
          return
        }
        if (!roles.includes(user.role)) {
          res.status(403).json({ error: 'Insufficient permissions' })
          return
        }
        next()
      }) as RequestHandler
    },
  }
}

// Re-export core types that consumers will need
export type { AuthCoreConfig, PublicUser, DatabaseAdapter, EmailAdapter } from '@authcore/types'
export { AuthError } from '@authcore/core'
