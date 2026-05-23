/**
 * Integration tests for @authcore/fastify
 *
 * Prerequisites:
 *   docker compose up -d   (starts Postgres on port 5433)
 *   pnpm --filter @authcore/prisma-adapter db:push
 *
 * Tests use a real Postgres DB and a real Fastify app.
 * They are skipped automatically if DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createAuth } from '../index.js'
import * as dotenv from 'dotenv'
import { resolve } from 'node:path'
import type { EmailAdapter } from '@authcore/core'

dotenv.config({ path: resolve(process.cwd(), '.env') })

/** In-memory EmailAdapter that captures every send() for assertions. */
function createCaptureEmail(): {
  provider: EmailAdapter
  sent: Array<{ from: string; to: string; subject: string; html: string; text: string }>
} {
  const sent: Array<{ from: string; to: string; subject: string; html: string; text: string }> = []
  return {
    provider: { async send(options) { sent.push({ ...options }) } },
    sent,
  }
}

const DATABASE_URL = process.env['DATABASE_URL']
const AUTH_SECRET = process.env['AUTH_SECRET'] ?? 'test-secret-at-least-32-chars-long-enough!!'

const describeIf = DATABASE_URL ? describe : describe.skip

let prisma: PrismaClient
let app: FastifyInstance

describeIf('@authcore/fastify integration', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    })
    await prisma.$connect()

    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
    })

    app = Fastify()
    await app.register(cookie)
    await app.register(auth.plugin(), { prefix: '/auth' })

    app.get('/dashboard', {
      preHandler: [auth.authRequired()],
    }, async (request) => {
      return { user: request.user }
    })

    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.token.deleteMany()
    const oauthDelegate = (prisma as unknown as { oAuthAccount?: { deleteMany: () => Promise<unknown> } }).oAuthAccount
    if (oauthDelegate?.deleteMany) await oauthDelegate.deleteMany()
    await prisma.user.deleteMany()
  })

  // ---- Registration ----

  describe('POST /auth/register', () => {
    it('creates a user and returns 201 with user + token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'alice@example.com', password: 'securepassword123' },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.user.email).toBe('alice@example.com')
      expect(body.user.emailVerified).toBe(false)
      expect(body.token).toBeTruthy()
      expect(body.user).not.toHaveProperty('passwordHash')
    })

    it('returns 409 if email is already taken', async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'alice@example.com', password: 'securepassword123' },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'alice@example.com', password: 'anotherpassword123' },
      })

      expect(res.statusCode).toBe(409)
      expect(res.json().code).toBe('EMAIL_EXISTS')
    })

    it('returns 400 on invalid email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'not-an-email', password: 'password123' },
      })

      expect(res.statusCode).toBe(400)
      expect(res.json().code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 on short password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'user@example.com', password: 'short' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  // ---- Login ----

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'bob@example.com', password: 'mypassword123' },
      })
    })

    it('returns 200 with user + token for valid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'bob@example.com', password: 'mypassword123' },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.user.email).toBe('bob@example.com')
      expect(body.token).toBeTruthy()
      expect(body.user).not.toHaveProperty('passwordHash')
    })

    it('returns 401 for wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'bob@example.com', password: 'wrongpassword' },
      })

      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 401 for non-existent email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'nobody@example.com', password: 'password123' },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  // ---- Logout ----

  describe('POST /auth/logout', () => {
    it('returns 200 with a logout message', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/logout',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().message).toMatch(/logged out/i)
    })
  })

  // ---- Protected route /me ----

  describe('GET /auth/me', () => {
    it('returns the user for a valid token', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'carol@example.com', password: 'mypassword123' },
      })
      const { token } = registerRes.json() as { token: string }

      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().email).toBe('carol@example.com')
    })

    it('returns 401 with no token', async () => {
      const res = await app.inject({ method: 'GET', url: '/auth/me' })
      expect(res.statusCode).toBe(401)
    })

    it('returns 401 with a bad token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: 'Bearer garbage.token.value' },
      })

      expect(res.statusCode).toBe(401)
    })
  })

  // ---- Protected custom route /dashboard ----

  describe('GET /dashboard (protected via authRequired)', () => {
    it('returns user data for authenticated request', async () => {
      const registerRes = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'dave@example.com', password: 'mypassword123' },
      })
      const { token } = registerRes.json() as { token: string }

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard',
        headers: { authorization: `Bearer ${token}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().user.email).toBe('dave@example.com')
    })

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/dashboard' })
      expect(res.statusCode).toBe(401)
    })
  })

  // ---- Full auth flow ----

  describe('Full auth flow', () => {
    it('register → login → /me all work end-to-end', async () => {
      // 1. Register
      const regRes = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'fullflow@example.com', password: 'password12345' },
      })
      expect(regRes.statusCode).toBe(201)

      // 2. Login
      const loginRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'fullflow@example.com', password: 'password12345' },
      })
      expect(loginRes.statusCode).toBe(200)
      const { token } = loginRes.json() as { token: string }

      // 3. /me with login token
      const meRes = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${token}` },
      })
      expect(meRes.statusCode).toBe(200)
      expect(meRes.json().email).toBe('fullflow@example.com')
    })
  })
})

// ---- Extended flows: password reset, cookie mode, custom cookieName, invite, RBAC ----

describeIf('@authcore/fastify — extended flows', () => {
  beforeEach(async () => {
    await prisma.token.deleteMany()
    const oauthDelegate = (prisma as unknown as { oAuthAccount?: { deleteMany: () => Promise<unknown> } }).oAuthAccount
    if (oauthDelegate?.deleteMany) await oauthDelegate.deleteMany()
    await prisma.user.deleteMany()
  })

  it('forgot-password / reset-password E2E does NOT leak AUTH_SECRET in the email URL', async () => {
    const capture = createCaptureEmail()

    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
      features: ['passwordReset'],
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    const flowApp = Fastify()
    await flowApp.register(cookie)
    await flowApp.register(auth.plugin({ baseUrl: 'https://app.example.com' }), { prefix: '/auth' })
    await flowApp.ready()

    await flowApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'reset@example.com', password: 'originalpass123' },
    })

    const forgotRes = await flowApp.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'reset@example.com' },
    })
    expect(forgotRes.statusCode).toBe(200)
    expect(capture.sent).toHaveLength(1)

    const email = capture.sent[0]!
    expect(email.html).toContain('https://app.example.com/reset-password?token=')
    expect(email.html).not.toContain(AUTH_SECRET)
    expect(email.text).not.toContain(AUTH_SECRET)

    const rawToken = email.html.match(/token=([a-f0-9]+)/)![1]!

    const resetRes = await flowApp.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: rawToken, password: 'newpassword456' },
    })
    expect(resetRes.statusCode).toBe(200)

    const loginRes = await flowApp.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'reset@example.com', password: 'newpassword456' },
    })
    expect(loginRes.statusCode).toBe(200)

    await flowApp.close()
  })

  it('cookie-mode round trip: login sets cookie, /me reads it', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
    })

    const cookieApp = Fastify()
    await cookieApp.register(cookie)
    await cookieApp.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })
    await cookieApp.ready()

    const regRes = await cookieApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'cookie@example.com', password: 'cookiepass123' },
    })
    expect(regRes.statusCode).toBe(201)
    expect(regRes.json().token).toBeUndefined()
    const setCookieHeader = regRes.headers['set-cookie'] as string | string[]
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0]! : setCookieHeader
    expect(cookieStr).toMatch(/^authcore_token=/)

    const meRes = await cookieApp.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieStr.split(';')[0]! },
    })
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().email).toBe('cookie@example.com')

    await cookieApp.close()
  })

  it('custom session.cookieName: login writes AND /me reads the SAME custom name', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h', cookieName: 'my_token' },
    })

    const customApp = Fastify()
    await customApp.register(cookie)
    await customApp.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })
    await customApp.ready()

    const regRes = await customApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'custom@example.com', password: 'custompass123' },
    })
    expect(regRes.statusCode).toBe(201)
    const setCookieHeader = regRes.headers['set-cookie'] as string | string[]
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0]! : setCookieHeader
    expect(cookieStr).toMatch(/^my_token=/)

    const meRes = await customApp.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieStr.split(';')[0]! },
    })
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().email).toBe('custom@example.com')

    await customApp.close()
  })

  it('requireRole happy path: admin user can access protected admin route', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
    })

    const adminApp = Fastify()
    await adminApp.register(cookie)
    await adminApp.register(auth.plugin(), { prefix: '/auth' })
    adminApp.get('/admin', {
      preHandler: [auth.authRequired(), auth.requireRole('admin')],
    }, async (request) => ({ user: request.user }))
    await adminApp.ready()

    await adminApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'admin@example.com', password: 'adminpass123' },
    })
    await prisma.user.update({
      where: { email: 'admin@example.com' },
      data: { role: 'admin' },
    })
    const loginRes = await adminApp.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@example.com', password: 'adminpass123' },
    })
    const token = loginRes.json().token

    const adminRes = await adminApp.inject({
      method: 'GET',
      url: '/admin',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(adminRes.statusCode).toBe(200)
    expect(adminRes.json().user.role).toBe('admin')

    await adminApp.close()
  })

  it('invitation flow: invite + accept-invitation E2E', async () => {
    const capture = createCaptureEmail()

    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
      features: ['invitation'],
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    const inviteApp = Fastify()
    await inviteApp.register(cookie)
    await inviteApp.register(auth.plugin({ baseUrl: 'https://app.example.com' }), { prefix: '/auth' })
    await inviteApp.ready()

    const inviterReg = await inviteApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'inviter@example.com', password: 'inviterpass123' },
    })
    const inviterToken = inviterReg.json().token

    const inviteRes = await inviteApp.inject({
      method: 'POST',
      url: '/auth/invite',
      headers: { authorization: `Bearer ${inviterToken}` },
      payload: { email: 'invited@example.com', role: 'editor' },
    })
    expect(inviteRes.statusCode).toBe(200)
    expect(capture.sent[0]!.html).toContain('https://app.example.com/accept-invitation?token=')

    const rawToken = capture.sent[0]!.html.match(/token=([a-f0-9]+)/)![1]!

    const acceptRes = await inviteApp.inject({
      method: 'POST',
      url: '/auth/accept-invitation',
      payload: { token: rawToken, password: 'invitedpass123' },
    })
    expect(acceptRes.statusCode).toBe(200)
    expect(acceptRes.json().user.email).toBe('invited@example.com')
    expect(acceptRes.json().user.role).toBe('editor')

    await inviteApp.close()
  })
})

// ---- 0.10: refresh tokens and CSRF ----

describeIf('@authcore/fastify — refresh tokens', () => {
  beforeEach(async () => {
    await prisma.token.deleteMany()
    const oauthDelegate = (prisma as unknown as { oAuthAccount?: { deleteMany: () => Promise<unknown> } }).oAuthAccount
    if (oauthDelegate?.deleteMany) await oauthDelegate.deleteMany()
    await prisma.user.deleteMany()
  })

  it('register returns refreshToken in api mode', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '15m', refreshExpiresIn: '30d' },
    })
    const app2 = Fastify()
    await app2.register(cookie)
    await app2.register(auth.plugin(), { prefix: '/auth' })
    await app2.ready()

    const res = await app2.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'refresh@example.com', password: 'refreshpass123' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.token).toBeTruthy()
    expect(body.refreshToken).toMatch(/^[a-f0-9]{64}$/)
    await app2.close()
  })

  it('POST /refresh rotates the refresh token', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET },
    })
    const app2 = Fastify()
    await app2.register(cookie)
    await app2.register(auth.plugin(), { prefix: '/auth' })
    await app2.ready()

    const reg = await app2.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'rot@example.com', password: 'rotpass123' },
    })
    const oldRefresh = reg.json().refreshToken as string

    const refreshRes = await app2.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: oldRefresh },
    })
    expect(refreshRes.statusCode).toBe(200)
    expect(refreshRes.json().refreshToken).not.toBe(oldRefresh)

    const reused = await app2.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: oldRefresh },
    })
    expect(reused.statusCode).toBe(401)
    expect(reused.json().code).toBe('INVALID_TOKEN')
    await app2.close()
  })

  it('cookie mode: register sets refresh cookie; /refresh reads it', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET },
    })
    const app2 = Fastify()
    await app2.register(cookie)
    await app2.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })
    await app2.ready()

    const reg = await app2.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'ckrefresh@example.com', password: 'ckpass123' },
    })
    expect(reg.statusCode).toBe(201)
    const setCookieRaw = reg.headers['set-cookie']
    const setCookies = (Array.isArray(setCookieRaw) ? setCookieRaw : [setCookieRaw as string]).filter(Boolean)
    const names = setCookies.map((c) => c.split('=')[0])
    expect(names).toContain('authcore_token')
    expect(names).toContain('authcore_token_refresh')

    const cookieHeader = setCookies.map((c) => c.split(';')[0]).join('; ')
    const refRes = await app2.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: cookieHeader },
    })
    expect(refRes.statusCode).toBe(200)
    await app2.close()
  })
})

describeIf('@authcore/fastify — CSRF (opt-in)', () => {
  beforeEach(async () => {
    await prisma.token.deleteMany()
    const oauthDelegate = (prisma as unknown as { oAuthAccount?: { deleteMany: () => Promise<unknown> } }).oAuthAccount
    if (oauthDelegate?.deleteMany) await oauthDelegate.deleteMany()
    await prisma.user.deleteMany()
  })

  it('with csrf: true, register sets the authcore_token_csrf cookie (NOT httpOnly)', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
    })
    const csrfApp = Fastify()
    await csrfApp.register(cookie)
    await csrfApp.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })
    await csrfApp.ready()

    const reg = await csrfApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'csrf@example.com', password: 'csrfpass123' },
    })
    const raw = reg.headers['set-cookie']
    const cookies = (Array.isArray(raw) ? raw : [raw as string]).filter(Boolean)
    const csrfCookie = cookies.find((c) => c.startsWith('authcore_token_csrf='))
    expect(csrfCookie).toBeTruthy()
    expect(csrfCookie!.toLowerCase()).not.toContain('httponly')
    await csrfApp.close()
  })

  it('state-changing request without matching X-CSRF-Token returns 403', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
    })
    const csrfApp = Fastify()
    await csrfApp.register(cookie)
    await csrfApp.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })
    await csrfApp.ready()

    const reg = await csrfApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'csrf2@example.com', password: 'csrfpass123' },
    })
    const raw = reg.headers['set-cookie']
    const cookies = (Array.isArray(raw) ? raw : [raw as string]).filter(Boolean)
    const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ')

    const blocked = await csrfApp.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: cookieHeader },
      payload: {},
    })
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json().code).toBe('CSRF_INVALID')
    await csrfApp.close()
  })

  it('matching X-CSRF-Token header passes the CSRF check', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
    })
    const csrfApp = Fastify()
    await csrfApp.register(cookie)
    await csrfApp.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })
    await csrfApp.ready()

    const reg = await csrfApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'csrf3@example.com', password: 'csrfpass123' },
    })
    const raw = reg.headers['set-cookie']
    const cookies = (Array.isArray(raw) ? raw : [raw as string]).filter(Boolean)
    const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ')
    const csrfPair = cookies.find((c) => c.startsWith('authcore_token_csrf='))!
    const csrfValue = csrfPair.split(';')[0]!.split('=')[1]!

    const allowed = await csrfApp.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: cookieHeader, 'x-csrf-token': csrfValue },
      payload: {},
    })
    // CSRF check passed; refresh body empty → auth-level 401
    expect(allowed.statusCode).toBe(401)
    expect(allowed.json().code).toBe('INVALID_TOKEN')
    await csrfApp.close()
  })

  it('GET requests skip CSRF check', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
    })
    const csrfApp = Fastify()
    await csrfApp.register(cookie)
    await csrfApp.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })
    await csrfApp.ready()

    const reg = await csrfApp.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'csrfget@example.com', password: 'csrfpass123' },
    })
    const raw = reg.headers['set-cookie']
    const cookies = (Array.isArray(raw) ? raw : [raw as string]).filter(Boolean)
    const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ')

    const meRes = await csrfApp.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader },
    })
    expect(meRes.statusCode).toBe(200)
    await csrfApp.close()
  })
})

// ---- 0.11: OAuth ----

function makeFakeFastifyProvider(opts: { email?: string; emailVerified?: boolean } = {}) {
  const { email = 'oauth@example.com', emailVerified = true } = opts
  return {
    id: 'google',
    scopes: ['openid', 'email', 'profile'],
    authorize: ({ state, codeChallenge, redirectUri }: { state: string; codeChallenge: string; redirectUri: string }) =>
      `https://provider.example/authorize?state=${state}&challenge=${codeChallenge}&redirect=${encodeURIComponent(redirectUri)}`,
    exchangeCode: async () => ({ accessToken: 'fake-access', refreshToken: 'fake-refresh', expiresIn: 3600 }),
    getUserInfo: async () => ({ id: 'remote-1', email, emailVerified, name: 'Remote' }),
  }
}

describeIf('@authcore/fastify OAuth (0.11)', () => {
  it('GET /auth/oauth/google redirects to provider, callback completes flow (api mode)', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET },
      oauth: { google: makeFakeFastifyProvider({ email: 'fastify-oauth@example.com' }) },
    })
    const oauthApp = Fastify()
    await oauthApp.register(cookie)
    await oauthApp.register(auth.plugin({ baseUrl: 'http://localhost' }), { prefix: '/auth' })
    await oauthApp.ready()

    const startRes = await oauthApp.inject({ method: 'GET', url: '/auth/oauth/google' })
    expect(startRes.statusCode).toBe(302)
    const url = new URL(startRes.headers['location'] as string)
    expect(url.host).toBe('provider.example')
    const state = url.searchParams.get('state')!

    const cbRes = await oauthApp.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?code=remote-code&state=${encodeURIComponent(state)}`,
    })
    expect(cbRes.statusCode).toBe(200)
    const body = cbRes.json()
    expect(body.user.email).toBe('fastify-oauth@example.com')
    expect(body.token).toBeTruthy()
    expect(body.refreshToken).toBeTruthy()
    await oauthApp.close()
  })

  it('cookie mode: callback sets 3 cookies and redirects', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
      oauth: { google: makeFakeFastifyProvider({ email: 'fastify-cookie-oauth@example.com' }) },
    })
    const oauthApp = Fastify()
    await oauthApp.register(cookie)
    await oauthApp.register(
      auth.plugin({ baseUrl: 'http://localhost', useCookies: true, oauthSuccessRedirect: '/dashboard' }),
      { prefix: '/auth' },
    )
    await oauthApp.ready()

    const startRes = await oauthApp.inject({ method: 'GET', url: '/auth/oauth/google' })
    const url = new URL(startRes.headers['location'] as string)
    const state = url.searchParams.get('state')!

    const cbRes = await oauthApp.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?code=remote-code&state=${encodeURIComponent(state)}`,
    })
    expect(cbRes.statusCode).toBe(302)
    expect(cbRes.headers['location']).toBe('/dashboard')
    const setCookieHeader = cbRes.headers['set-cookie']
    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader as string]
    expect(cookies.some((c) => c.startsWith('authcore_token='))).toBe(true)
    expect(cookies.some((c) => c.startsWith('authcore_token_refresh='))).toBe(true)
    expect(cookies.some((c) => c.startsWith('authcore_token_csrf='))).toBe(true)
    await oauthApp.close()
  })
})
