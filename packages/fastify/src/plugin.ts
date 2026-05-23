import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AuthCore } from '@authcore/core'
import { AuthError, generateCsrfToken, safeCompareTokens } from '@authcore/core'
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
    refresh?: string
    revoke?: string
    /** OAuth start route. Default: '/oauth/:provider'. Must include ':provider' placeholder. */
    oauth?: string
    /** OAuth callback route. Default: '/oauth/:provider/callback'. Must include ':provider' placeholder. */
    oauthCallback?: string
  }
  /** Cookie name for monorepo/cookie mode (default: 'authcore_token'). Refresh cookie uses `${cookieName}_refresh`, CSRF cookie uses `${cookieName}_csrf`. */
  cookieName?: string
  /** If true, set httpOnly cookies on login/register/refresh/accept-invitation instead of returning token in body */
  useCookies?: boolean
  /**
   * Where to redirect the user after a successful OAuth callback in cookie mode.
   * Default: '/'. Ignored when `useCookies` is false (the response is JSON).
   */
  oauthSuccessRedirect?: string
}

function handleError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof AuthError) {
    return reply.code(err.statusCode).send({ error: err.message, code: err.code })
  }
  console.error('[AuthCore]', err)
  return reply.code(500).send({ error: 'Internal server error' })
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Create a Fastify plugin that registers all auth routes.
 */
export function createAuthPlugin(auth: AuthCore, config: PluginConfig = {}) {
  const {
    baseUrl = '',
    useCookies = false,
    routes: routePaths = {},
  } = config
  const cookieName = config.cookieName ?? auth.config.session.cookieName ?? 'authcore_token'
  const refreshCookieName = `${cookieName}_refresh`
  const csrfCookieName = `${cookieName}_csrf`
  const csrfEnabled = auth.config.session.csrf === true

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
    refresh: routePaths.refresh ?? '/refresh',
    revoke: routePaths.revoke ?? '/revoke',
    oauth: routePaths.oauth ?? '/oauth/:provider',
    oauthCallback: routePaths.oauthCallback ?? '/oauth/:provider/callback',
  }
  const oauthSuccessRedirect = config.oauthSuccessRedirect ?? '/'

  const isProduction = process.env['NODE_ENV'] === 'production'
  const authRequired = createAuthRequired(auth, cookieName)

  function setAuthCookies(reply: FastifyReply, token: string, refreshToken: string): void {
    void reply.setCookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' })
    void reply.setCookie(refreshCookieName, refreshToken, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' })
    if (csrfEnabled) {
      void reply.setCookie(csrfCookieName, generateCsrfToken(), {
        httpOnly: false,
        sameSite: 'lax',
        secure: isProduction,
        path: '/',
      })
    }
  }

  function clearAuthCookies(reply: FastifyReply): void {
    void reply.clearCookie(cookieName, { path: '/' })
    void reply.clearCookie(refreshCookieName, { path: '/' })
    if (csrfEnabled) void reply.clearCookie(csrfCookieName, { path: '/' })
  }

  function readRefreshToken(request: FastifyRequest): string | null {
    const body = request.body as { refreshToken?: string } | undefined
    if (body?.refreshToken) return body.refreshToken
    return request.cookies[refreshCookieName] ?? null
  }

  return async function authPlugin(fastify: FastifyInstance) {
    if (csrfEnabled) {
      fastify.addHook('preHandler', async (request, reply) => {
        if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return
        const cookieToken = request.cookies[csrfCookieName]
        if (!cookieToken) return // first request — no CSRF cookie yet
        const headerToken = request.headers['x-csrf-token']
        const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken
        if (!headerValue || !safeCompareTokens(cookieToken, headerValue)) {
          return reply.code(403).send({ error: 'CSRF token missing or invalid', code: 'CSRF_INVALID' })
        }
      })
    }

    // POST /register
    fastify.post(paths.register, async (request, reply) => {
      try {
        const { user, token, refreshToken } = await auth.register(request.body)
        if (useCookies) {
          setAuthCookies(reply, token, refreshToken)
          return reply.code(201).send({ user })
        }
        return reply.code(201).send({ user, token, refreshToken })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // POST /login
    fastify.post(paths.login, async (request, reply) => {
      try {
        const { user, token, refreshToken } = await auth.login(request.body)
        if (useCookies) {
          setAuthCookies(reply, token, refreshToken)
          return reply.send({ user })
        }
        return reply.send({ user, token, refreshToken })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // POST /refresh
    fastify.post(paths.refresh, async (request, reply) => {
      try {
        const rawRefresh = readRefreshToken(request)
        if (!rawRefresh) {
          return reply.code(401).send({ error: 'Refresh token is required', code: 'INVALID_TOKEN' })
        }
        const { user, token, refreshToken } = await auth.refresh(rawRefresh)
        if (useCookies) {
          setAuthCookies(reply, token, refreshToken)
          return reply.send({ user })
        }
        return reply.send({ user, token, refreshToken })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // POST /revoke
    fastify.post(paths.revoke, async (request, reply) => {
      try {
        const rawRefresh = readRefreshToken(request)
        if (rawRefresh) await auth.revoke(rawRefresh)
        if (useCookies) clearAuthCookies(reply)
        return reply.send({ message: 'Revoked' })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // POST /logout — revoke refresh + clear cookies
    fastify.post(paths.logout, async (request, reply) => {
      try {
        const rawRefresh = readRefreshToken(request)
        if (rawRefresh) await auth.revoke(rawRefresh)
      } catch {
        // Swallow — logout best-effort
      }
      if (useCookies) clearAuthCookies(reply)
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
        const resetUrl = `${baseUrl}${paths.resetPassword}`
        await auth.forgotPassword(request.body, { resetUrl })
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
        const { user, token, refreshToken } = await auth.acceptInvitation(request.body)
        if (useCookies) {
          setAuthCookies(reply, token, refreshToken)
          return reply.send({ user })
        }
        return reply.send({ user, token, refreshToken })
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // GET /oauth/:provider — kick off OAuth flow
    fastify.get(paths.oauth, async (request, reply) => {
      try {
        const provider = String((request.params as { provider?: string }).provider ?? '')
        const redirectUri = `${baseUrl}${paths.oauthCallback.replace(':provider', provider)}`
        const { authorizationUrl } = await auth.oauthStart(provider, redirectUri)
        return reply.redirect(authorizationUrl)
      } catch (err) {
        return handleError(reply, err)
      }
    })

    // GET /oauth/:provider/callback — provider redirects here with ?code&state
    fastify.get(paths.oauthCallback, async (request, reply) => {
      try {
        const provider = String((request.params as { provider?: string }).provider ?? '')
        const q = request.query as { code?: string; state?: string }
        const redirectUri = `${baseUrl}${paths.oauthCallback.replace(':provider', provider)}`
        const { user, token, refreshToken } = await auth.oauthCallback(provider, {
          code: q.code ?? '',
          state: q.state ?? '',
          redirectUri,
        })
        if (useCookies) {
          setAuthCookies(reply, token, refreshToken)
          return reply.redirect(oauthSuccessRedirect)
        }
        if (config.oauthSuccessRedirect) {
          const params = new URLSearchParams({ token, refreshToken })
          return reply.redirect(`${oauthSuccessRedirect}#${params.toString()}`)
        }
        return reply.send({ user, token, refreshToken })
      } catch (err) {
        return handleError(reply, err)
      }
    })
  }
}
