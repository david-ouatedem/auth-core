import { Router } from 'express'
import type { AuthCore } from '@authcore/core'
import { AuthError } from '@authcore/core'
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
  }
  /** Cookie name for monorepo/cookie mode (default: 'authcore_token') */
  cookieName?: string
  /** If true, set an httpOnly cookie on login/register instead of returning token in body */
  useCookies?: boolean
}

/**
 * Handle AuthError and generic errors uniformly.
 */
function handleError(res: import('express').Response, err: unknown): void {
  if (err instanceof AuthError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code })
    return
  }
  console.error('[AuthCore]', err)
  res.status(500).json({ error: 'Internal server error' })
}

/**
 * Create and return an Express Router with all auth routes mounted.
 */
export function createAuthRouter(auth: AuthCore, config: RouterConfig = {}): Router {
  const router = Router()
  const middleware = createAuthMiddleware(auth)
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
  }

  // POST /register
  router.post(paths.register, async (req, res) => {
    try {
      const { user, token } = await auth.register(req.body)
      if (useCookies) {
        res.cookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        res.status(201).json({ user })
      } else {
        res.status(201).json({ user, token })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /login
  router.post(paths.login, async (req, res) => {
    try {
      const { user, token } = await auth.login(req.body)
      if (useCookies) {
        res.cookie(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: process.env['NODE_ENV'] === 'production' })
        res.json({ user })
      } else {
        res.json({ user, token })
      }
    } catch (err) {
      handleError(res, err)
    }
  })

  // POST /logout
  router.post(paths.logout, (_req, res) => {
    if (useCookies) {
      res.clearCookie(cookieName)
    }
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
      await auth.forgotPassword(req.body)
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

  return router
}
