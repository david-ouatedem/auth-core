import type { FastifyInstance, FastifyReply } from 'fastify'
import type { AuthCore } from '@authcore/core'
import { AuthError } from '@authcore/core'
import '@fastify/cookie'
import { createAuthRequired } from './hooks.js'

export interface PluginConfig {
  /** Base URL used to build links in emails (e.g. 'https://myapp.com') */
  baseUrl?: string
  routes?: {
    register?: string
    login?: string
    logout?: string
    me?: string
    verifyEmail?: string
    forgotPassword?: string
    resetPassword?: string
    invite?: string
    acceptInvitation?: string
  }
  /** Cookie name for monorepo/cookie mode (default: 'authcore_token') */
  cookieName?: string
  /** If true, set an httpOnly cookie on login/register instead of returning token in body */
  useCookies?: boolean
}

function handleError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof AuthError) {
    return reply.code(err.statusCode).send({ error: err.message, code: err.code })
  }
  console.error('[AuthCore]', err)
  return reply.code(500).send({ error: 'Internal server error' })
}

/**
 * Create a Fastify plugin that registers all auth routes.
 */
export function createAuthPlugin(auth: AuthCore, config: PluginConfig = {}) {
  const {
    baseUrl = '',
    cookieName = 'authcore_token',
    useCookies = false,
    routes: routePaths = {},
  } = config

  const paths = {
    register: routePaths.register ?? '/register',
    login: routePaths.login ?? '/login',
    logout: routePaths.logout ?? '/logout',
    me: routePaths.me ?? '/me',
    verifyEmail: routePaths.verifyEmail ?? '/verify-email',
    forgotPassword: routePaths.forgotPassword ?? '/forgot-password',
    resetPassword: routePaths.resetPassword ?? '/reset-password',
    invite: routePaths.invite ?? '/invite',
    acceptInvitation: routePaths.acceptInvitation ?? '/accept-invitation',
  }

  const isProduction = process.env['NODE_ENV'] === 'production'
  const authRequired = createAuthRequired(auth, cookieName)

  return async function authPlugin(fastify: FastifyInstance) {
    // POST /register
    fastify.post(paths.register, async (request, reply) => {
      try {
        const { user, token } = await auth.register(request.body)
        if (useCookies) {
          void reply.setCookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' })
          return reply.code(201).send({ user })
        }
        return reply.code(201).send({ user, token })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // POST /login
    fastify.post(paths.login, async (request, reply) => {
      try {
        const { user, token } = await auth.login(request.body)
        if (useCookies) {
          void reply.setCookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' })
          return reply.send({ user })
        }
        return reply.send({ user, token })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // POST /logout
    fastify.post(paths.logout, async (_request, reply) => {
      if (useCookies) {
        void reply.clearCookie(cookieName, { path: '/' })
      }
      return reply.send({ message: 'Logged out successfully' })
    })

    // GET /me — protected
    fastify.get(paths.me, { preHandler: [authRequired] }, async (request, reply) => {
      return reply.send(request.user)
    })

    // POST /verify-email
    fastify.post(paths.verifyEmail, async (request, reply) => {
      try {
        await auth.verifyEmail(request.body)
        return reply.send({ message: 'Email verified successfully' })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // POST /forgot-password — always 200
    fastify.post(paths.forgotPassword, async (request, reply) => {
      try {
        await auth.forgotPassword(request.body)
      } catch {
        // Intentionally swallow — no email enumeration
      }
      return reply.send({ message: 'If that email exists, a reset link has been sent.' })
    })

    // POST /reset-password
    fastify.post(paths.resetPassword, async (request, reply) => {
      try {
        await auth.resetPassword(request.body)
        return reply.send({ message: 'Password updated successfully' })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // POST /invite (protected, requires auth)
    fastify.post(paths.invite, { preHandler: [authRequired] }, async (request, reply) => {
      try {
        const inviteUrl = `${baseUrl}${paths.acceptInvitation}`
        await auth.invite(request.body, { inviteUrl })
        return reply.send({ message: 'Invitation sent' })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // POST /accept-invitation (public)
    fastify.post(paths.acceptInvitation, async (request, reply) => {
      try {
        const { user, token } = await auth.acceptInvitation(request.body)
        if (useCookies) {
          void reply.setCookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' })
          return reply.send({ user })
        }
        return reply.send({ user, token })
      } catch (err) {
        return handleError(reply, err)
      }
    })
  }
}
