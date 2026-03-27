import { createAuth as createCoreAuth } from '@authcore/core'
import type { AuthCoreConfig } from '@authcore/types'
import type { FastifyPluginAsync, preHandlerHookHandler } from 'fastify'
import { createAuthPlugin } from './plugin.js'
import type { PluginConfig } from './plugin.js'
import { createAuthRequired, createAuthOptional } from './hooks.js'

export type { PluginConfig }

/**
 * The Fastify AuthCore instance — wraps the core auth logic with Fastify-specific
 * plugin registration and preHandler hooks.
 */
export interface FastifyAuth {
  /**
   * Returns a Fastify plugin that registers all auth routes.
   * Register with: `app.register(auth.plugin(), { prefix: '/auth' })`
   */
  plugin(config?: PluginConfig): FastifyPluginAsync

  /**
   * Returns a preHandler hook that validates the JWT (or cookie) and
   * attaches `request.user`. Returns 401 on failure.
   *
   * Use to protect routes:
   * `app.get('/dashboard', { preHandler: [auth.authRequired()] }, handler)`
   */
  authRequired(): preHandlerHookHandler

  /**
   * Returns a preHandler hook that optionally attaches `request.user` if
   * a valid token is present, but does NOT reject unauthenticated requests.
   */
  authOptional(): preHandlerHookHandler

  /**
   * Returns a preHandler hook that checks `request.user.role` against the allowed roles.
   * Must be used after `authRequired()`.
   * Returns 403 if the user's role is not in the allowed list.
   *
   * @example
   * `app.get('/admin', { preHandler: [auth.authRequired(), auth.requireRole('admin')] }, handler)`
   */
  requireRole(...roles: string[]): preHandlerHookHandler
}

/**
 * Create a Fastify-specific AuthCore instance.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify'
 * import cookie from '@fastify/cookie'
 * import { createAuth } from '@authcore/fastify'
 * import { prismaAdapter } from '@authcore/prisma-adapter'
 *
 * const app = Fastify()
 * await app.register(cookie)
 *
 * const auth = createAuth({
 *   db: prismaAdapter(prisma),
 *   session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
 * })
 *
 * await app.register(auth.plugin(), { prefix: '/auth' })
 *
 * app.get('/dashboard', {
 *   preHandler: [auth.authRequired()]
 * }, async (request) => {
 *   return { user: request.user }
 * })
 * ```
 */
export function createAuth(config: AuthCoreConfig): FastifyAuth {
  const core = createCoreAuth(config)

  return {
    plugin(pluginConfig?: PluginConfig) {
      return createAuthPlugin(core, pluginConfig)
    },

    authRequired() {
      return createAuthRequired(core) as preHandlerHookHandler
    },

    authOptional() {
      return createAuthOptional(core) as preHandlerHookHandler
    },

    requireRole(...roles: string[]) {
      return ((request, reply, done) => {
        const user = request.user
        if (!user) {
          void reply.code(401).send({ error: 'Authentication required' })
          return
        }
        if (!roles.includes(user.role)) {
          void reply.code(403).send({ error: 'Insufficient permissions' })
          return
        }
        done()
      }) as preHandlerHookHandler
    },
  }
}

// Re-export core types that consumers will need
export type { AuthCoreConfig, PublicUser, DatabaseAdapter, EmailAdapter } from '@authcore/types'
export { AuthError } from '@authcore/core'
