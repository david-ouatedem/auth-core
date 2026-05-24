import { Router } from 'express'
import type { Request, Response } from 'express'
import type { AuthCore } from '@authcore/core'
import { AuthError, generateCsrfToken, safeCompareTokens } from '@authcore/core'
import { createAuthMiddleware } from './middleware.js'

export interface RouterConfig {
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
    /** Magic-link send route (POST). Default: '/magic-link'. */
    sendMagicLink?: string
    /** Magic-link consume route (GET). Default: '/magic-link/consume'. */
    consumeMagicLink?: string
    /** 2FA setup (authed POST). Default: '/2fa/setup'. */
    setupTwoFactor?: string
    /** 2FA enable confirmation (authed POST). Default: '/2fa/enable'. */
    enableTwoFactor?: string
    /** 2FA disable (authed POST, requires password). Default: '/2fa/disable'. */
    disableTwoFactor?: string
    /** 2FA verify TOTP code (public POST). Default: '/2fa/verify'. */
    verifyTwoFactor?: string
    /** 2FA recovery-code use (public POST). Default: '/2fa/recovery'. */
    useRecoveryCode?: string
  }
  /** Cookie name for monorepo/cookie mode (default: 'authcore_token'). Refresh cookie uses `${cookieName}_refresh`, CSRF cookie uses `${cookieName}_csrf`. */
  cookieName?: string
  /** If true, set httpOnly cookies on login/register/refresh/accept-invitation instead of returning the token in the body */
  useCookies?: boolean
  /**
   * Where to redirect the user after a successful OAuth callback in cookie mode.
   * Default: '/'. Ignored when `useCookies` is false (the response is JSON).
   */
  oauthSuccessRedirect?: string
  /**
   * Where to redirect the user after a successful magic-link consume in
   * cookie mode. Default: '/'. In api mode + `magicLinkSuccessRedirect` set,
   * the server redirects to that URL with `#token=…&refreshToken=…`.
   */
  magicLinkSuccessRedirect?: string
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code })
    return
  }
  console.error('[AuthCore]', err)
  res.status(500).json({ error: 'Internal server error' })
}

/** Methods that mutate server state — subject to CSRF check when enabled. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Create and return an Express Router with all auth routes mounted.
 */
export function createAuthRouter(auth: AuthCore, config: RouterConfig = {}): Router {
  const router = Router()
  const {
    baseUrl = '',
    useCookies = false,
    routes: routePaths = {},
  } = config
  const cookieName = config.cookieName ?? auth.config.session.cookieName ?? 'authcore_token'
  const refreshCookieName = `${cookieName}_refresh`
  const csrfCookieName = `${cookieName}_csrf`
  const csrfEnabled = auth.config.session.csrf === true
  const middleware = createAuthMiddleware(auth, cookieName)
  const isProd = process.env['NODE_ENV'] === 'production'

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
    sendMagicLink: routePaths.sendMagicLink ?? '/magic-link',
    consumeMagicLink: routePaths.consumeMagicLink ?? '/magic-link/consume',
    setupTwoFactor: routePaths.setupTwoFactor ?? '/2fa/setup',
    enableTwoFactor: routePaths.enableTwoFactor ?? '/2fa/enable',
    disableTwoFactor: routePaths.disableTwoFactor ?? '/2fa/disable',
    verifyTwoFactor: routePaths.verifyTwoFactor ?? '/2fa/verify',
    useRecoveryCode: routePaths.useRecoveryCode ?? '/2fa/recovery',
  }
  const oauthSuccessRedirect = config.oauthSuccessRedirect ?? '/'
  const magicLinkSuccessRedirect = config.magicLinkSuccessRedirect ?? '/'

  function setAuthCookies(res: Response, token: string, refreshToken: string): void {
    res.cookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' })
    res.cookie(refreshCookieName, refreshToken, { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' })
    if (csrfEnabled) {
      res.cookie(csrfCookieName, generateCsrfToken(), {
        httpOnly: false, // must be readable by client JS
        sameSite: 'lax',
        secure: isProd,
        path: '/',
      })
    }
  }

  function clearAuthCookies(res: Response): void {
    res.clearCookie(cookieName, { path: '/' })
    res.clearCookie(refreshCookieName, { path: '/' })
    if (csrfEnabled) res.clearCookie(csrfCookieName, { path: '/' })
  }

  function readRefreshToken(req: Request): string | null {
    const body = req.body as { refreshToken?: string } | undefined
    if (body?.refreshToken) return body.refreshToken
    const cookies = req.cookies as Record<string, string> | undefined
    return cookies?.[refreshCookieName] ?? null
  }

  /**
   * CSRF guard. Skips safe methods and pre-auth endpoints (register/login),
   * which establish the CSRF cookie. Returns 403 on mismatch.
   *
   * Only invoked when `session.csrf: true`.
   */
  function csrfGuard(req: Request, res: Response, next: () => void): void {
    if (!csrfEnabled) return next()
    if (!STATE_CHANGING_METHODS.has(req.method.toUpperCase())) return next()
    const cookies = req.cookies as Record<string, string> | undefined
    const cookieToken = cookies?.[csrfCookieName]
    // If there's no CSRF cookie yet (first request, pre-login), let it through.
    // Subsequent authenticated state-changing requests must echo it back.
    if (!cookieToken) return next()
    const headerToken = req.headers['x-csrf-token']
    const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken
    if (!headerValue || !safeCompareTokens(cookieToken, headerValue)) {
      res.status(403).json({ error: 'CSRF token missing or invalid', code: 'CSRF_INVALID' })
      return
    }
    next()
  }

  router.use(csrfGuard)

  // POST /register
  router.post(paths.register, async (req, res) => {
    try {
      const { user, token, refreshToken } = await auth.register(req.body)
      if (useCookies) {
        setAuthCookies(res, token, refreshToken)
        res.status(201).json({ user })
      } else {
        res.status(201).json({ user, token, refreshToken })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /login
  router.post(paths.login, async (req, res) => {
    try {
      const result = await auth.login(req.body)
      if ('requires2FA' in result) {
        res.json({ requires2FA: true, challengeToken: result.challengeToken })
        return
      }
      const { user, token, refreshToken } = result
      if (useCookies) {
        setAuthCookies(res, token, refreshToken)
        res.json({ user })
      } else {
        res.json({ user, token, refreshToken })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /refresh — exchange a refresh token for a new JWT + rotated refresh token
  router.post(paths.refresh, async (req, res) => {
    try {
      const rawRefresh = readRefreshToken(req)
      if (!rawRefresh) {
        res.status(401).json({ error: 'Refresh token is required', code: 'INVALID_TOKEN' })
        return
      }
      const { user, token, refreshToken } = await auth.refresh(rawRefresh)
      if (useCookies) {
        setAuthCookies(res, token, refreshToken)
        res.json({ user })
      } else {
        res.json({ user, token, refreshToken })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /revoke — invalidate a single refresh token (idempotent)
  router.post(paths.revoke, async (req, res) => {
    try {
      const rawRefresh = readRefreshToken(req)
      if (rawRefresh) await auth.revoke(rawRefresh)
      if (useCookies) clearAuthCookies(res)
      res.json({ message: 'Revoked' })
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /logout — revoke refresh + clear cookies
  router.post(paths.logout, async (req, res) => {
    try {
      const rawRefresh = readRefreshToken(req)
      if (rawRefresh) await auth.revoke(rawRefresh)
    } catch {
      // Swallow — logout should be best-effort
    }
    if (useCookies) clearAuthCookies(res)
    res.json({ message: 'Logged out successfully' })
  })

  // GET /me — protected
  router.get(paths.me, middleware, (req, res) => {
    res.json(req.user)
  })

  // POST /verify-email
  router.post(paths.verifyEmail, async (req, res) => {
    try {
      await auth.verifyEmail(req.body)
      res.json({ message: 'Email verified successfully' })
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /forgot-password — always 200
  router.post(paths.forgotPassword, async (req, res) => {
    try {
      const resetUrl = `${baseUrl}${paths.resetPassword}`
      await auth.forgotPassword(req.body, { resetUrl })
    } catch {
      // Intentionally swallow — no email enumeration
    }
    res.json({ message: 'If that email exists, a reset link has been sent.' })
  })

  // POST /reset-password
  router.post(paths.resetPassword, async (req, res) => {
    try {
      await auth.resetPassword(req.body)
      res.json({ message: 'Password updated successfully' })
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /invite (protected, requires auth)
  router.post(paths.invite, middleware, async (req, res) => {
    try {
      const inviteUrl = `${baseUrl}${paths.acceptInvitation}`
      await auth.invite(req.body, { inviteUrl })
      res.json({ message: 'Invitation sent' })
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /accept-invitation (public)
  router.post(paths.acceptInvitation, async (req, res) => {
    try {
      const { user, token, refreshToken } = await auth.acceptInvitation(req.body)
      if (useCookies) {
        setAuthCookies(res, token, refreshToken)
        res.json({ user })
      } else {
        res.json({ user, token, refreshToken })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /magic-link — send a magic-link email. Always 200 (enumeration-safe).
  router.post(paths.sendMagicLink, async (req, res) => {
    try {
      const magicLinkUrl = `${baseUrl}${paths.consumeMagicLink}`
      await auth.sendMagicLink(req.body, { magicLinkUrl })
    } catch (err) {
      // FEATURE_DISABLED / EMAIL_NOT_CONFIGURED / MISSING_URL are config errors,
      // not enumeration leaks — surface them. Anything else is silenced below
      // by sendMagicLinkFeature's swallow.
      if (err instanceof AuthError && err.code !== 'INVALID_TOKEN') {
        return handleError(res, err)
      }
    }
    res.json({ message: 'If that email exists, a sign-in link has been sent.' })
  })

  // GET /magic-link/consume?token=… — complete sign-in from the email link.
  router.get(paths.consumeMagicLink, async (req, res) => {
    try {
      const token = typeof req.query['token'] === 'string' ? req.query['token'] : ''
      const { user, token: jwt, refreshToken } = await auth.consumeMagicLink({ token })
      if (useCookies) {
        setAuthCookies(res, jwt, refreshToken)
        res.redirect(magicLinkSuccessRedirect)
      } else if (config.magicLinkSuccessRedirect) {
        const params = new URLSearchParams({ token: jwt, refreshToken })
        res.redirect(`${magicLinkSuccessRedirect}#${params.toString()}`)
      } else {
        res.json({ user, token: jwt, refreshToken })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /2fa/setup — authed; returns { secret, otpauthUrl, recoveryCodes }
  router.post(paths.setupTwoFactor, middleware, async (req, res) => {
    try {
      const result = await auth.setupTwoFactor(req.user!.id)
      res.json(result)
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /2fa/enable — authed; body { code }; confirms enrollment
  router.post(paths.enableTwoFactor, middleware, async (req, res) => {
    try {
      const body = req.body as { code?: string }
      if (!body?.code) {
        res.status(400).json({ error: 'code is required', code: 'VALIDATION_ERROR' })
        return
      }
      await auth.enableTwoFactor(req.user!.id, body.code)
      res.json({ message: 'Two-factor authentication enabled' })
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /2fa/disable — authed; body { password }; requires re-auth
  router.post(paths.disableTwoFactor, middleware, async (req, res) => {
    try {
      const body = req.body as { password?: string }
      if (!body?.password) {
        res.status(400).json({ error: 'password is required', code: 'VALIDATION_ERROR' })
        return
      }
      await auth.disableTwoFactor(req.user!.id, body.password)
      res.json({ message: 'Two-factor authentication disabled' })
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /2fa/verify — public; body { challengeToken, code }
  router.post(paths.verifyTwoFactor, async (req, res) => {
    try {
      const body = req.body as { challengeToken?: string; code?: string }
      if (!body?.challengeToken || !body?.code) {
        res.status(400).json({ error: 'challengeToken and code are required', code: 'VALIDATION_ERROR' })
        return
      }
      const { user, token, refreshToken } = await auth.verifyTwoFactor(body.challengeToken, body.code)
      if (useCookies) {
        setAuthCookies(res, token, refreshToken)
        res.json({ user })
      } else {
        res.json({ user, token, refreshToken })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /2fa/recovery — public; body { challengeToken, code }
  router.post(paths.useRecoveryCode, async (req, res) => {
    try {
      const body = req.body as { challengeToken?: string; code?: string }
      if (!body?.challengeToken || !body?.code) {
        res.status(400).json({ error: 'challengeToken and code are required', code: 'VALIDATION_ERROR' })
        return
      }
      const { user, token, refreshToken } = await auth.useRecoveryCode(body.challengeToken, body.code)
      if (useCookies) {
        setAuthCookies(res, token, refreshToken)
        res.json({ user })
      } else {
        res.json({ user, token, refreshToken })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  // GET /oauth/:provider — kick off OAuth flow
  router.get(paths.oauth, async (req, res) => {
    try {
      const provider = String(req.params['provider'] ?? '')
      const redirectUri = `${baseUrl}${paths.oauthCallback.replace(':provider', provider)}`
      const { authorizationUrl } = await auth.oauthStart(provider, redirectUri)
      res.redirect(authorizationUrl)
    } catch (err) {
      handleError(res, err)
    }
  })

  // GET /oauth/:provider/callback — provider redirects here with ?code&state
  router.get(paths.oauthCallback, async (req, res) => {
    try {
      const provider = String(req.params['provider'] ?? '')
      const code = typeof req.query['code'] === 'string' ? req.query['code'] : ''
      const state = typeof req.query['state'] === 'string' ? req.query['state'] : ''
      const redirectUri = `${baseUrl}${paths.oauthCallback.replace(':provider', provider)}`
      const { user, token, refreshToken } = await auth.oauthCallback(provider, {
        code,
        state,
        redirectUri,
      })
      if (useCookies) {
        setAuthCookies(res, token, refreshToken)
        res.redirect(oauthSuccessRedirect)
      } else if (config.oauthSuccessRedirect) {
        // API mode + redirect requested: pass tokens in URL fragment so the SPA can pick them up.
        const params = new URLSearchParams({ token, refreshToken })
        res.redirect(`${oauthSuccessRedirect}#${params.toString()}`)
      } else {
        res.json({ user, token, refreshToken })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  return router
}
