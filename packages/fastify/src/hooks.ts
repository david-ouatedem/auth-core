import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthCore } from '@authcore/core'
import type { PublicUser } from '@authcore/core'
import '@fastify/cookie'

declare module 'fastify' {
  interface FastifyRequest {
    user?: PublicUser
  }
}

/**
 * Extract a Bearer token from the Authorization header or a cookie.
 */
export function extractToken(request: FastifyRequest, cookieName: string): string | null {
  const authHeader = request.headers['authorization']
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  const cookieToken = request.cookies[cookieName]
  return cookieToken ?? null
}

/**
 * Create a preHandler hook that requires authentication.
 * Attaches `request.user` if the token is valid.
 * Returns 401 if no token is provided or the token is invalid.
 */
export function createAuthRequired(auth: AuthCore, cookieName = 'authcore_token') {
  return async function authRequired(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = extractToken(request, cookieName)

    if (!token) {
      return reply.code(401).send({ error: 'Authentication required' })
    }

    const user = await auth.verifyToken(token)

    if (!user) {
      return reply.code(401).send({ error: 'Invalid or expired token' })
    }

    request.user = user
  }
}

/**
 * Create a preHandler hook that optionally attaches `request.user`
 * if a valid token is present, but does NOT reject unauthenticated requests.
 */
export function createAuthOptional(auth: AuthCore, cookieName = 'authcore_token') {
  return async function authOptional(
    request: FastifyRequest,
  ): Promise<void> {
    const token = extractToken(request, cookieName)

    if (token) {
      const user = await auth.verifyToken(token)
      if (user) {
        request.user = user
      }
    }
  }
}
