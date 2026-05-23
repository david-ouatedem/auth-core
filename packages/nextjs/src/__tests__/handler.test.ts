import { describe, it, expect, vi } from 'vitest'
import { createNextAuthHandler } from '../handler.js'
import type { AuthCore } from '@authcore/core'

const TEST_SECRET = 'test-secret-at-least-32-chars-long!!'

function makeUser(overrides: Partial<{ id: string; email: string; emailVerified: boolean; role: string }> = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    emailVerified: false,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

/** Build a stub AuthCore that lets each test override the bits they exercise. */
function makeStubAuth(overrides: Partial<AuthCore> = {}): AuthCore {
  const baseConfig = {
    db: {} as any,
    session: { strategy: 'jwt' as const, secret: TEST_SECRET, cookieName: 'authcore_token' },
  }
  return {
    register: vi.fn(),
    login: vi.fn(),
    verifyToken: vi.fn().mockResolvedValue(null),
    sendEmailVerification: vi.fn(),
    verifyEmail: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    invite: vi.fn(),
    acceptInvitation: vi.fn(),
    refresh: vi.fn(),
    revoke: vi.fn(),
    revokeAll: vi.fn(),
    sendMagicLink: vi.fn(),
    consumeMagicLink: vi.fn(),
    oauthStart: vi.fn(),
    oauthCallback: vi.fn(),
    config: baseConfig,
    ...overrides,
  } as AuthCore
}

describe('createNextAuthHandler', () => {
  describe('POST /register', () => {
    it('returns 201 with { user, token, refreshToken } in api mode', async () => {
      const auth = makeStubAuth({
        register: vi.fn().mockResolvedValue({
          user: makeUser({ email: 'new@example.com' }),
          token: 'jwt-1',
          refreshToken: 'ref-1',
        }),
      })
      const handler = createNextAuthHandler(auth, {
        baseUrl: 'http://localhost',
        useCookies: false,
      })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'new@example.com', password: 'pw123456' }),
        }),
      )

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.user.email).toBe('new@example.com')
      expect(body.token).toBe('jwt-1')
      expect(body.refreshToken).toBe('ref-1')
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('returns 201 with cookies + user-only body in cookie mode', async () => {
      const auth = makeStubAuth({
        register: vi.fn().mockResolvedValue({
          user: makeUser({ email: 'new@example.com' }),
          token: 'jwt-2',
          refreshToken: 'ref-2',
        }),
      })
      const handler = createNextAuthHandler(auth, {
        baseUrl: 'http://localhost',
        useCookies: true,
      })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'new@example.com', password: 'pw123456' }),
        }),
      )

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.user.email).toBe('new@example.com')
      expect(body.token).toBeUndefined()
      const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
      const joined = cookies.join('|')
      expect(joined).toContain('authcore_token=jwt-2')
      expect(joined).toContain('authcore_token_refresh=ref-2')
    })
  })

  describe('POST /login', () => {
    it('proxies to auth.login and returns the session', async () => {
      const login = vi
        .fn()
        .mockResolvedValue({ user: makeUser(), token: 'jwt-x', refreshToken: 'ref-x' })
      const auth = makeStubAuth({ login })
      const handler = createNextAuthHandler(auth, {
        baseUrl: 'http://localhost',
        useCookies: false,
      })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.com', password: 'pw' }),
        }),
      )

      expect(res.status).toBe(200)
      expect(login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' })
    })

    it('surfaces AuthError status + code', async () => {
      const { AuthError } = await import('@authcore/core')
      const auth = makeStubAuth({
        login: vi.fn().mockRejectedValue(new AuthError('Invalid', 'INVALID_CREDENTIALS', 401)),
      })
      const handler = createNextAuthHandler(auth, { baseUrl: 'http://localhost' })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.com', password: 'bad' }),
        }),
      )

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.code).toBe('INVALID_CREDENTIALS')
    })
  })

  describe('GET /me', () => {
    it('returns 401 when no cookie or Bearer header', async () => {
      const auth = makeStubAuth()
      const handler = createNextAuthHandler(auth, { baseUrl: 'http://localhost' })

      const res = await handler.GET(new Request('http://localhost/api/auth/me'))
      expect(res.status).toBe(401)
    })

    it('returns the user when the cookie token verifies', async () => {
      const auth = makeStubAuth({
        verifyToken: vi.fn().mockResolvedValue(makeUser({ email: 'me@example.com' })),
      })
      const handler = createNextAuthHandler(auth, { baseUrl: 'http://localhost' })

      const res = await handler.GET(
        new Request('http://localhost/api/auth/me', {
          headers: { cookie: 'authcore_token=valid-jwt' },
        }),
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.email).toBe('me@example.com')
      expect(auth.verifyToken).toHaveBeenCalledWith('valid-jwt')
    })

    it('falls back to Authorization: Bearer …', async () => {
      const auth = makeStubAuth({
        verifyToken: vi.fn().mockResolvedValue(makeUser({ email: 'bearer@example.com' })),
      })
      const handler = createNextAuthHandler(auth, { baseUrl: 'http://localhost' })

      const res = await handler.GET(
        new Request('http://localhost/api/auth/me', {
          headers: { authorization: 'Bearer bearer-jwt' },
        }),
      )

      expect(res.status).toBe(200)
      expect(auth.verifyToken).toHaveBeenCalledWith('bearer-jwt')
    })
  })

  describe('POST /logout', () => {
    it('revokes the refresh token from the cookie and clears auth cookies', async () => {
      const revoke = vi.fn().mockResolvedValue(undefined)
      const auth = makeStubAuth({ revoke })
      const handler = createNextAuthHandler(auth, {
        baseUrl: 'http://localhost',
        useCookies: true,
      })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: { cookie: 'authcore_token=x; authcore_token_refresh=ref-z' },
        }),
      )

      expect(res.status).toBe(200)
      expect(revoke).toHaveBeenCalledWith('ref-z')
      const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
      const joined = cookies.join('|')
      expect(joined).toContain('authcore_token=')
      expect(joined).toContain('Expires=Thu, 01 Jan 1970')
    })
  })

  describe('POST /refresh', () => {
    it('reads refresh token from cookie, mints a new session', async () => {
      const refresh = vi.fn().mockResolvedValue({
        user: makeUser(),
        token: 'new-jwt',
        refreshToken: 'new-ref',
      })
      const auth = makeStubAuth({ refresh })
      const handler = createNextAuthHandler(auth, {
        baseUrl: 'http://localhost',
        useCookies: true,
      })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/refresh', {
          method: 'POST',
          headers: { cookie: 'authcore_token_refresh=old-refresh' },
        }),
      )

      expect(res.status).toBe(200)
      expect(refresh).toHaveBeenCalledWith('old-refresh')
    })

    it('returns 401 when no refresh token is supplied', async () => {
      const auth = makeStubAuth()
      const handler = createNextAuthHandler(auth, { baseUrl: 'http://localhost' })
      const res = await handler.POST(
        new Request('http://localhost/api/auth/refresh', { method: 'POST' }),
      )
      expect(res.status).toBe(401)
    })
  })

  describe('CSRF guard', () => {
    it('blocks state-changing requests in cookie mode when CSRF cookie present + header mismatched', async () => {
      const auth = makeStubAuth()
      ;(auth.config.session as { csrf?: boolean }).csrf = true
      const handler = createNextAuthHandler(auth, {
        baseUrl: 'http://localhost',
        useCookies: true,
      })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/refresh', {
          method: 'POST',
          headers: {
            cookie: 'authcore_token_csrf=expected-csrf',
            'x-csrf-token': 'wrong',
          },
        }),
      )

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('CSRF_INVALID')
    })

    it('lets through state-changing requests when no CSRF cookie yet (pre-login)', async () => {
      const auth = makeStubAuth({
        login: vi
          .fn()
          .mockResolvedValue({ user: makeUser(), token: 'j', refreshToken: 'r' }),
      })
      ;(auth.config.session as { csrf?: boolean }).csrf = true
      const handler = createNextAuthHandler(auth, {
        baseUrl: 'http://localhost',
        useCookies: true,
      })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'a@b.com', password: 'pw' }),
        }),
      )

      expect(res.status).toBe(200)
    })
  })

  describe('OAuth start', () => {
    it('GET /oauth/:provider redirects to provider authorization URL', async () => {
      const auth = makeStubAuth({
        oauthStart: vi.fn().mockResolvedValue({
          authorizationUrl: 'https://provider.example/auth?state=x',
          state: 'x',
        }),
      })
      const handler = createNextAuthHandler(auth, { baseUrl: 'http://localhost' })

      const res = await handler.GET(
        new Request('http://localhost/api/auth/oauth/google', { method: 'GET' }),
      )
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('https://provider.example/auth?state=x')
      expect(auth.oauthStart).toHaveBeenCalledWith(
        'google',
        'http://localhost/api/auth/oauth/google/callback',
      )
    })
  })

  describe('Magic-link', () => {
    it('POST /magic-link returns 200 even when sendMagicLink throws (enumeration-safe)', async () => {
      const auth = makeStubAuth({
        sendMagicLink: vi.fn().mockRejectedValue(new Error('downstream boom')),
      })
      const handler = createNextAuthHandler(auth, { baseUrl: 'http://localhost' })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/magic-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'x@y.com' }),
        }),
      )

      expect(res.status).toBe(200)
    })

    it('POST /magic-link surfaces FEATURE_DISABLED (not an enumeration leak)', async () => {
      const { AuthError } = await import('@authcore/core')
      const auth = makeStubAuth({
        sendMagicLink: vi
          .fn()
          .mockRejectedValue(new AuthError('disabled', 'FEATURE_DISABLED', 500)),
      })
      const handler = createNextAuthHandler(auth, { baseUrl: 'http://localhost' })

      const res = await handler.POST(
        new Request('http://localhost/api/auth/magic-link', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'x@y.com' }),
        }),
      )

      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.code).toBe('FEATURE_DISABLED')
    })

    it('GET /magic-link/consume sets cookies + redirects in cookie mode', async () => {
      const auth = makeStubAuth({
        consumeMagicLink: vi.fn().mockResolvedValue({
          user: makeUser(),
          token: 'mjwt',
          refreshToken: 'mref',
        }),
      })
      const handler = createNextAuthHandler(auth, {
        baseUrl: 'http://localhost',
        useCookies: true,
        magicLinkSuccessRedirect: '/dashboard',
      })

      const res = await handler.GET(
        new Request('http://localhost/api/auth/magic-link/consume?token=raw'),
      )

      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/dashboard')
      const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? '']
      expect(cookies.join('|')).toContain('authcore_token=mjwt')
    })
  })

  describe('unmatched routes', () => {
    it('returns 404 NOT_FOUND for unknown paths', async () => {
      const auth = makeStubAuth()
      const handler = createNextAuthHandler(auth, { baseUrl: 'http://localhost' })

      const res = await handler.GET(
        new Request('http://localhost/api/auth/no-such-endpoint'),
      )
      expect(res.status).toBe(404)
    })
  })
})
