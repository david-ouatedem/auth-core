import type { AuthCore } from '@authcore/core'
import { AuthError, generateCsrfToken, safeCompareTokens } from '@authcore/core'

export interface NextAuthHandlerOptions {
  /** Base URL of the app, used to build links in emails (e.g. 'https://myapp.com'). */
  baseUrl: string
  /** Default `true` (the standard Next.js auth pattern). Set false for Bearer-token mode. */
  useCookies?: boolean
  /** Where to redirect after a successful OAuth callback in cookie mode. Default '/'. */
  oauthSuccessRedirect?: string
  /** Where to redirect after a successful magic-link consume in cookie mode. Default '/'. */
  magicLinkSuccessRedirect?: string
  /**
   * Catch-all base path. Default `/api/auth`. Matches the directory you mount the
   * handler at, e.g. `app/api/auth/[...authcore]/route.ts`.
   */
  basePath?: string
}

interface ResolvedPaths {
  register: string
  login: string
  logout: string
  me: string
  verifyEmail: string
  forgotPassword: string
  resetPassword: string
  invite: string
  acceptInvitation: string
  refresh: string
  revoke: string
  oauth: string
  oauthCallback: string
  sendMagicLink: string
  consumeMagicLink: string
  setupTwoFactor: string
  enableTwoFactor: string
  disableTwoFactor: string
  verifyTwoFactor: string
  useRecoveryCode: string
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

interface NextAuthRouteHandler {
  GET(request: Request): Promise<Response>
  POST(request: Request): Promise<Response>
}

/**
 * Create a Next.js App Router catch-all auth handler.
 *
 * Mount it at `app/api/auth/[...authcore]/route.ts`:
 *
 * ```ts
 * import { auth } from '@/lib/auth'
 * import { createNextAuthHandler } from '@authcore/nextjs'
 *
 * const handler = createNextAuthHandler(auth, { baseUrl: 'https://myapp.com' })
 * export const { GET, POST } = handler
 * export const runtime = 'nodejs'   // bcryptjs + jsonwebtoken need Node, not Edge
 * ```
 */
export function createNextAuthHandler(
  auth: AuthCore,
  options: NextAuthHandlerOptions,
): NextAuthRouteHandler {
  const {
    baseUrl,
    useCookies = true,
    oauthSuccessRedirect = '/',
    magicLinkSuccessRedirect = '/',
    basePath = '/api/auth',
  } = options

  const cookieName = auth.config.session.cookieName ?? 'authcore_token'
  const refreshCookieName = `${cookieName}_refresh`
  const csrfCookieName = `${cookieName}_csrf`
  const csrfEnabled = auth.config.session.csrf === true
  const isProd = process.env['NODE_ENV'] === 'production'

  const paths: ResolvedPaths = {
    register: '/register',
    login: '/login',
    logout: '/logout',
    me: '/me',
    verifyEmail: '/verify-email',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    invite: '/invite',
    acceptInvitation: '/accept-invitation',
    refresh: '/refresh',
    revoke: '/revoke',
    oauth: '/oauth/:provider',
    oauthCallback: '/oauth/:provider/callback',
    sendMagicLink: '/magic-link',
    consumeMagicLink: '/magic-link/consume',
    setupTwoFactor: '/2fa/setup',
    enableTwoFactor: '/2fa/enable',
    disableTwoFactor: '/2fa/disable',
    verifyTwoFactor: '/2fa/verify',
    useRecoveryCode: '/2fa/recovery',
  }

  async function dispatch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    // Strip the basePath so the rest of the dispatcher sees clean route paths
    // (e.g. '/login' instead of '/api/auth/login').
    const relPath = url.pathname.startsWith(basePath)
      ? url.pathname.slice(basePath.length) || '/'
      : url.pathname

    // CSRF guard for cookie-mode state-changing requests
    if (csrfEnabled && STATE_CHANGING_METHODS.has(request.method)) {
      const cookies = parseCookies(request.headers.get('cookie'))
      const cookieToken = cookies[csrfCookieName]
      if (cookieToken) {
        const headerToken = request.headers.get('x-csrf-token')
        if (!headerToken || !safeCompareTokens(cookieToken, headerToken)) {
          return json({ error: 'CSRF token missing or invalid', code: 'CSRF_INVALID' }, 403)
        }
      }
      // No cookie yet (pre-login) → let through; cookie will be set on success
    }

    try {
      // --- auth routes ---
      if (request.method === 'POST' && relPath === paths.register) {
        const body = await readJson(request)
        const { user, token, refreshToken } = await auth.register(body)
        return sessionResponse({ user, token, refreshToken, status: 201 })
      }

      if (request.method === 'POST' && relPath === paths.login) {
        const body = await readJson(request)
        const result = await auth.login(body)
        if ('requires2FA' in result) {
          return json(
            { requires2FA: true, challengeToken: result.challengeToken },
            200,
          )
        }
        return sessionResponse({
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
          status: 200,
        })
      }

      if (request.method === 'POST' && relPath === paths.refresh) {
        const rawRefresh = await readRefreshToken(request)
        if (!rawRefresh) {
          return json({ error: 'Refresh token is required', code: 'INVALID_TOKEN' }, 401)
        }
        const { user, token, refreshToken } = await auth.refresh(rawRefresh)
        return sessionResponse({ user, token, refreshToken, status: 200 })
      }

      if (request.method === 'POST' && relPath === paths.revoke) {
        const rawRefresh = await readRefreshToken(request)
        if (rawRefresh) await auth.revoke(rawRefresh)
        const headers = new Headers({ 'content-type': 'application/json' })
        if (useCookies) appendClearCookies(headers)
        return new Response(JSON.stringify({ message: 'Revoked' }), { status: 200, headers })
      }

      if (request.method === 'POST' && relPath === paths.logout) {
        try {
          const rawRefresh = await readRefreshToken(request)
          if (rawRefresh) await auth.revoke(rawRefresh)
        } catch {
          // best-effort
        }
        const headers = new Headers({ 'content-type': 'application/json' })
        if (useCookies) appendClearCookies(headers)
        return new Response(JSON.stringify({ message: 'Logged out successfully' }), {
          status: 200,
          headers,
        })
      }

      if (request.method === 'GET' && relPath === paths.me) {
        const user = await readUserFromRequest(request)
        if (!user) return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
        return json(user, 200)
      }

      if (request.method === 'POST' && relPath === paths.verifyEmail) {
        const body = await readJson(request)
        await auth.verifyEmail(body)
        return json({ message: 'Email verified successfully' }, 200)
      }

      if (request.method === 'POST' && relPath === paths.forgotPassword) {
        const body = await readJson(request)
        try {
          await auth.forgotPassword(body, { resetUrl: `${baseUrl}${basePath}${paths.resetPassword}` })
        } catch {
          // swallow — no enumeration
        }
        return json({ message: 'If that email exists, a reset link has been sent.' }, 200)
      }

      if (request.method === 'POST' && relPath === paths.resetPassword) {
        const body = await readJson(request)
        await auth.resetPassword(body)
        return json({ message: 'Password updated successfully' }, 200)
      }

      if (request.method === 'POST' && relPath === paths.invite) {
        // Invite requires auth — check the cookie/bearer.
        const inviter = await readUserFromRequest(request)
        if (!inviter) return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
        const body = await readJson(request)
        await auth.invite(body, { inviteUrl: `${baseUrl}${basePath}${paths.acceptInvitation}` })
        return json({ message: 'Invitation sent' }, 200)
      }

      if (request.method === 'POST' && relPath === paths.acceptInvitation) {
        const body = await readJson(request)
        const { user, token, refreshToken } = await auth.acceptInvitation(body)
        return sessionResponse({ user, token, refreshToken, status: 200 })
      }

      // --- 2FA ---
      if (request.method === 'POST' && relPath === paths.setupTwoFactor) {
        const user = await readUserFromRequest(request)
        if (!user) return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
        const result = await auth.setupTwoFactor(user.id)
        return json(result, 200)
      }

      if (request.method === 'POST' && relPath === paths.enableTwoFactor) {
        const user = await readUserFromRequest(request)
        if (!user) return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
        const body = (await readJson(request)) as { code?: string }
        if (!body?.code) {
          return json({ error: 'code is required', code: 'VALIDATION_ERROR' }, 400)
        }
        await auth.enableTwoFactor(user.id, body.code)
        return json({ message: 'Two-factor authentication enabled' }, 200)
      }

      if (request.method === 'POST' && relPath === paths.disableTwoFactor) {
        const user = await readUserFromRequest(request)
        if (!user) return json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
        const body = (await readJson(request)) as { password?: string }
        if (!body?.password) {
          return json({ error: 'password is required', code: 'VALIDATION_ERROR' }, 400)
        }
        await auth.disableTwoFactor(user.id, body.password)
        return json({ message: 'Two-factor authentication disabled' }, 200)
      }

      if (request.method === 'POST' && relPath === paths.verifyTwoFactor) {
        const body = (await readJson(request)) as { challengeToken?: string; code?: string }
        if (!body?.challengeToken || !body?.code) {
          return json(
            { error: 'challengeToken and code are required', code: 'VALIDATION_ERROR' },
            400,
          )
        }
        const { user, token, refreshToken } = await auth.verifyTwoFactor(
          body.challengeToken,
          body.code,
        )
        return sessionResponse({ user, token, refreshToken, status: 200 })
      }

      if (request.method === 'POST' && relPath === paths.useRecoveryCode) {
        const body = (await readJson(request)) as { challengeToken?: string; code?: string }
        if (!body?.challengeToken || !body?.code) {
          return json(
            { error: 'challengeToken and code are required', code: 'VALIDATION_ERROR' },
            400,
          )
        }
        const { user, token, refreshToken } = await auth.useRecoveryCode(
          body.challengeToken,
          body.code,
        )
        return sessionResponse({ user, token, refreshToken, status: 200 })
      }

      // --- OAuth ---
      if (request.method === 'GET') {
        const oauthStart = matchPath(relPath, '/oauth/:provider')
        if (oauthStart?.provider) {
          const provider = oauthStart.provider
          const redirectUri = `${baseUrl}${basePath}/oauth/${encodeURIComponent(provider)}/callback`
          const { authorizationUrl } = await auth.oauthStart(provider, redirectUri)
          return Response.redirect(authorizationUrl, 302)
        }

        const oauthCallback = matchPath(relPath, '/oauth/:provider/callback')
        if (oauthCallback?.provider) {
          const provider = oauthCallback.provider
          const redirectUri = `${baseUrl}${basePath}/oauth/${encodeURIComponent(provider)}/callback`
          const code = url.searchParams.get('code') ?? ''
          const state = url.searchParams.get('state') ?? ''
          const { user, token, refreshToken } = await auth.oauthCallback(provider, {
            code,
            state,
            redirectUri,
          })
          if (useCookies) {
            const headers = sessionCookieHeaders(token, refreshToken)
            headers.set('location', oauthSuccessRedirect)
            return new Response(null, { status: 302, headers })
          }
          if (oauthSuccessRedirect !== '/') {
            // API-mode redirect with fragment
            const params = new URLSearchParams({ token, refreshToken })
            return Response.redirect(`${oauthSuccessRedirect}#${params.toString()}`, 302)
          }
          return json({ user, token, refreshToken }, 200)
        }
      }

      // --- Magic-link ---
      if (request.method === 'POST' && relPath === paths.sendMagicLink) {
        const body = await readJson(request)
        try {
          await auth.sendMagicLink(body, {
            magicLinkUrl: `${baseUrl}${basePath}${paths.consumeMagicLink}`,
          })
        } catch (err) {
          if (err instanceof AuthError && err.code !== 'INVALID_TOKEN') throw err
          // swallow other errors — enumeration-safe
        }
        return json({ message: 'If that email exists, a sign-in link has been sent.' }, 200)
      }

      if (request.method === 'GET' && relPath === paths.consumeMagicLink) {
        const token = url.searchParams.get('token') ?? ''
        const { user, token: jwt, refreshToken } = await auth.consumeMagicLink({ token })
        if (useCookies) {
          const headers = sessionCookieHeaders(jwt, refreshToken)
          headers.set('location', magicLinkSuccessRedirect)
          return new Response(null, { status: 302, headers })
        }
        if (magicLinkSuccessRedirect !== '/') {
          const params = new URLSearchParams({ token: jwt, refreshToken })
          return Response.redirect(`${magicLinkSuccessRedirect}#${params.toString()}`, 302)
        }
        return json({ user, token: jwt, refreshToken }, 200)
      }

      return json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
    } catch (err) {
      if (err instanceof AuthError) {
        return json({ error: err.message, code: err.code }, err.statusCode)
      }
      console.error('[AuthCore]', err)
      return json({ error: 'Internal server error' }, 500)
    }
  }

  // --- Helpers (closed over auth + config) ---

  function sessionResponse(params: {
    user: unknown
    token: string
    refreshToken: string
    status: number
  }): Response {
    const { user, token, refreshToken, status } = params
    if (useCookies) {
      const headers = sessionCookieHeaders(token, refreshToken)
      headers.set('content-type', 'application/json')
      return new Response(JSON.stringify({ user }), { status, headers })
    }
    return json({ user, token, refreshToken }, status)
  }

  function sessionCookieHeaders(token: string, refreshToken: string): Headers {
    const headers = new Headers()
    appendCookie(headers, cookieName, token, { httpOnly: true })
    appendCookie(headers, refreshCookieName, refreshToken, { httpOnly: true })
    if (csrfEnabled) {
      appendCookie(headers, csrfCookieName, generateCsrfToken(), { httpOnly: false })
    }
    return headers
  }

  function appendCookie(
    headers: Headers,
    name: string,
    value: string,
    opts: { httpOnly: boolean },
  ): void {
    const parts = [
      `${name}=${encodeURIComponent(value)}`,
      'Path=/',
      'SameSite=Lax',
    ]
    if (opts.httpOnly) parts.push('HttpOnly')
    if (isProd) parts.push('Secure')
    headers.append('set-cookie', parts.join('; '))
  }

  function appendClearCookies(headers: Headers): void {
    const expired = 'Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    headers.append('set-cookie', `${cookieName}=; ${expired}; HttpOnly; SameSite=Lax`)
    headers.append('set-cookie', `${refreshCookieName}=; ${expired}; HttpOnly; SameSite=Lax`)
    if (csrfEnabled) {
      headers.append('set-cookie', `${csrfCookieName}=; ${expired}; SameSite=Lax`)
    }
  }

  async function readRefreshToken(request: Request): Promise<string | null> {
    // Cookie first
    const cookies = parseCookies(request.headers.get('cookie'))
    if (cookies[refreshCookieName]) return cookies[refreshCookieName]!
    // Then body
    try {
      const body = await readJson(request)
      const r = (body as { refreshToken?: string })?.refreshToken
      return r ?? null
    } catch {
      return null
    }
  }

  async function readUserFromRequest(request: Request) {
    // Bearer header first
    const auth_header = request.headers.get('authorization')
    if (auth_header?.startsWith('Bearer ')) {
      return auth.verifyToken(auth_header.slice('Bearer '.length))
    }
    // Cookie fallback
    const cookies = parseCookies(request.headers.get('cookie'))
    const token = cookies[cookieName]
    if (!token) return null
    return auth.verifyToken(token)
  }

  return {
    GET: dispatch,
    POST: dispatch,
  }
}

// --- Standalone utilities (no closure required) ---

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function readJson(request: Request): Promise<unknown> {
  // Clone so we can read multiple times if needed
  try {
    return await request.clone().json()
  } catch {
    return {}
  }
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const pair of header.split(';')) {
    const [k, ...v] = pair.trim().split('=')
    if (!k) continue
    out[k] = decodeURIComponent(v.join('=') ?? '')
  }
  return out
}

function matchPath(actual: string, pattern: string): Record<string, string> | null {
  const actualParts = actual.split('/').filter(Boolean)
  const patternParts = pattern.split('/').filter(Boolean)
  if (actualParts.length !== patternParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!
    const a = actualParts[i]!
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(a)
    } else if (p !== a) {
      return null
    }
  }
  return params
}
