/**
 * Integration tests for @authcore/express
 *
 * Prerequisites:
 *   docker compose up -d   (starts Postgres on port 5433)
 *   pnpm --filter @authcore/prisma-adapter db:push
 *
 * Tests use a real Postgres DB and a real Express app.
 * They are skipped automatically if DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createAuth } from '../index.js'
import * as dotenv from 'dotenv'
import { resolve } from 'node:path'
import type { EmailAdapter } from '@authcore/core'

dotenv.config({ path: resolve(process.cwd(), '.env') })

/**
 * In-memory EmailAdapter that captures every send() for assertions.
 * Mirrors packages/core/src/__tests__/helpers/captureEmailAdapter.ts but inlined
 * here so we don't depend on test-only paths in @authcore/core's exports field.
 */
function createCaptureEmail(): {
  provider: EmailAdapter
  sent: Array<{ from: string; to: string; subject: string; html: string; text: string }>
} {
  const sent: Array<{ from: string; to: string; subject: string; html: string; text: string }> = []
  return {
    provider: {
      async send(options) {
        sent.push({ ...options })
      },
    },
    sent,
  }
}

const DATABASE_URL = process.env['DATABASE_URL']
const AUTH_SECRET = process.env['AUTH_SECRET'] ?? 'test-secret-at-least-32-chars-long-enough!!'

const describeIf = DATABASE_URL ? describe : describe.skip

let prisma: PrismaClient
let app: express.Express

describeIf('@authcore/express integration', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    })
    await prisma.$connect()

    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
    })

    app = express()
    app.use(express.json())
    app.use('/auth', auth.router())
    app.get('/dashboard', auth.middleware(), (req, res) => {
      res.json({ user: req.user })
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
  })

  // ---- Registration ----

  describe('POST /auth/register', () => {
    it('creates a user and returns 201 with user + token', async () => {
      const res = await request(app).post('/auth/register').send({
        email: 'alice@example.com',
        password: 'securepassword123',
      })

      expect(res.status).toBe(201)
      expect(res.body.user.email).toBe('alice@example.com')
      expect(res.body.user.emailVerified).toBe(false)
      expect(res.body.token).toBeTruthy()
      expect(res.body.user).not.toHaveProperty('passwordHash')
    })

    it('returns 409 if email is already taken', async () => {
      await request(app).post('/auth/register').send({
        email: 'alice@example.com',
        password: 'securepassword123',
      })

      const res = await request(app).post('/auth/register').send({
        email: 'alice@example.com',
        password: 'anotherpassword123',
      })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('EMAIL_EXISTS')
    })

    it('returns 400 on invalid email', async () => {
      const res = await request(app).post('/auth/register').send({
        email: 'not-an-email',
        password: 'password123',
      })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 on short password', async () => {
      const res = await request(app).post('/auth/register').send({
        email: 'user@example.com',
        password: 'short',
      })

      expect(res.status).toBe(400)
    })
  })

  // ---- Login ----

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/auth/register').send({
        email: 'bob@example.com',
        password: 'mypassword123',
      })
    })

    it('returns 200 with user + token for valid credentials', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'bob@example.com',
        password: 'mypassword123',
      })

      expect(res.status).toBe(200)
      expect(res.body.user.email).toBe('bob@example.com')
      expect(res.body.token).toBeTruthy()
      expect(res.body.user).not.toHaveProperty('passwordHash')
    })

    it('returns 401 for wrong password', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'bob@example.com',
        password: 'wrongpassword',
      })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 401 for non-existent email', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'nobody@example.com',
        password: 'password123',
      })

      expect(res.status).toBe(401)
    })
  })

  // ---- Logout ----

  describe('POST /auth/logout', () => {
    it('returns 200 with a logout message', async () => {
      const res = await request(app).post('/auth/logout')
      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/logged out/i)
    })
  })

  // ---- Protected route /me ----

  describe('GET /auth/me', () => {
    it('returns the user for a valid token', async () => {
      const registerRes = await request(app).post('/auth/register').send({
        email: 'carol@example.com',
        password: 'mypassword123',
      })
      const { token } = registerRes.body as { token: string }

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.email).toBe('carol@example.com')
    })

    it('returns 401 with no token', async () => {
      const res = await request(app).get('/auth/me')
      expect(res.status).toBe(401)
    })

    it('returns 401 with a bad token', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer garbage.token.value')
      expect(res.status).toBe(401)
    })
  })

  // ---- Protected custom route /dashboard ----

  describe('GET /dashboard (protected via middleware())', () => {
    it('returns user data for authenticated request', async () => {
      const registerRes = await request(app).post('/auth/register').send({
        email: 'dave@example.com',
        password: 'mypassword123',
      })
      const { token } = registerRes.body as { token: string }

      const res = await request(app)
        .get('/dashboard')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.user.email).toBe('dave@example.com')
    })

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/dashboard')
      expect(res.status).toBe(401)
    })
  })

  // ---- Full register → login → me flow ----

  describe('Full auth flow', () => {
    it('register → login → /me all work end-to-end', async () => {
      // 1. Register
      const regRes = await request(app).post('/auth/register').send({
        email: 'fullflow@example.com',
        password: 'password12345',
      })
      expect(regRes.status).toBe(201)

      // 2. Login
      const loginRes = await request(app).post('/auth/login').send({
        email: 'fullflow@example.com',
        password: 'password12345',
      })
      expect(loginRes.status).toBe(200)
      const { token } = loginRes.body as { token: string }

      // 3. /me with login token
      const meRes = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
      expect(meRes.status).toBe(200)
      expect(meRes.body.email).toBe('fullflow@example.com')
    })
  })
})

// ---- Password reset, email verification, cookie mode, invite, RBAC ----
//
// These suites build dedicated app instances per scenario so we can exercise the
// useCookies / custom cookieName / capture-email pathways without polluting the
// main app's config.

describeIf('@authcore/express — extended flows', () => {
  beforeEach(async () => {
    await prisma.token.deleteMany()
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

    const flowApp = express()
    flowApp.use(express.json())
    flowApp.use('/auth', auth.router({ baseUrl: 'https://app.example.com' }))

    // Register a user
    await request(flowApp).post('/auth/register').send({
      email: 'reset@example.com',
      password: 'originalpass123',
    })

    // Request password reset
    const forgotRes = await request(flowApp).post('/auth/forgot-password').send({
      email: 'reset@example.com',
    })
    expect(forgotRes.status).toBe(200)
    expect(capture.sent).toHaveLength(1)

    const email = capture.sent[0]!
    expect(email.to).toBe('reset@example.com')
    expect(email.html).toContain('https://app.example.com/reset-password?token=')
    // Regression: secret must never appear in the email body
    expect(email.html).not.toContain(AUTH_SECRET)
    expect(email.text).not.toContain(AUTH_SECRET)

    // Extract the raw token from the URL
    const match = email.html.match(/token=([a-f0-9]+)/)!
    const rawToken = match[1]!

    // Reset the password
    const resetRes = await request(flowApp).post('/auth/reset-password').send({
      token: rawToken,
      password: 'newpassword456',
    })
    expect(resetRes.status).toBe(200)

    // Login with new password works
    const loginRes = await request(flowApp).post('/auth/login').send({
      email: 'reset@example.com',
      password: 'newpassword456',
    })
    expect(loginRes.status).toBe(200)

    // Old password no longer works
    const oldLoginRes = await request(flowApp).post('/auth/login').send({
      email: 'reset@example.com',
      password: 'originalpass123',
    })
    expect(oldLoginRes.status).toBe(401)
  })

  it('cookie-mode round trip: login sets cookie, /me reads it', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
    })

    const cookieApp = express()
    cookieApp.use(express.json())
    cookieApp.use((req, _res, next) => {
      // tiny cookie parser
      const header = req.headers.cookie
      if (header) {
        req.cookies = Object.fromEntries(
          header.split(';').map((c) => {
            const [k, ...rest] = c.trim().split('=')
            return [k!, rest.join('=')]
          }),
        )
      } else {
        req.cookies = {}
      }
      next()
    })
    cookieApp.use('/auth', auth.router({ useCookies: true }))

    const regRes = await request(cookieApp).post('/auth/register').send({
      email: 'cookie@example.com',
      password: 'cookiepass123',
    })
    expect(regRes.status).toBe(201)
    expect(regRes.body.token).toBeUndefined() // token NOT in body
    const setCookie = regRes.headers['set-cookie']!
    expect(setCookie[0]).toMatch(/^authcore_token=/)

    // /me reads the cookie
    const meRes = await request(cookieApp).get('/auth/me').set('Cookie', setCookie)
    expect(meRes.status).toBe(200)
    expect(meRes.body.email).toBe('cookie@example.com')
  })

  it('custom session.cookieName: login writes AND /me reads the SAME custom name', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h', cookieName: 'my_token' },
    })

    const customApp = express()
    customApp.use(express.json())
    customApp.use((req, _res, next) => {
      const header = req.headers.cookie
      if (header) {
        req.cookies = Object.fromEntries(
          header.split(';').map((c) => {
            const [k, ...rest] = c.trim().split('=')
            return [k!, rest.join('=')]
          }),
        )
      } else {
        req.cookies = {}
      }
      next()
    })
    customApp.use('/auth', auth.router({ useCookies: true }))

    const regRes = await request(customApp).post('/auth/register').send({
      email: 'custom@example.com',
      password: 'custompass123',
    })
    expect(regRes.status).toBe(201)
    const setCookie = regRes.headers['set-cookie']!
    expect(setCookie[0]).toMatch(/^my_token=/) // custom name on the wire

    // /me must read the custom name (this is the bug-#2 regression check)
    const meRes = await request(customApp).get('/auth/me').set('Cookie', setCookie)
    expect(meRes.status).toBe(200)
    expect(meRes.body.email).toBe('custom@example.com')
  })

  it('requireRole happy path: admin user can access /admin route', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
    })

    const adminApp = express()
    adminApp.use(express.json())
    adminApp.use('/auth', auth.router())
    adminApp.get('/admin', auth.middleware(), auth.requireRole('admin'), (req, res) => {
      res.json({ user: req.user })
    })

    // Register a user, then promote to admin via the adapter
    await request(adminApp).post('/auth/register').send({
      email: 'admin@example.com',
      password: 'adminpass123',
    })
    await prisma.user.update({
      where: { email: 'admin@example.com' },
      data: { role: 'admin' },
    })
    // Re-login to get a token carrying the new role
    const loginRes = await request(adminApp).post('/auth/login').send({
      email: 'admin@example.com',
      password: 'adminpass123',
    })
    const token = loginRes.body.token

    const adminRes = await request(adminApp).get('/admin').set('Authorization', `Bearer ${token}`)
    expect(adminRes.status).toBe(200)
    expect(adminRes.body.user.role).toBe('admin')
  })

  it('invitation flow: invite + accept-invitation E2E', async () => {
    const capture = createCaptureEmail()

    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
      features: ['invitation'],
      email: { provider: capture.provider, from: 'auth@test.com' },
    })

    const inviteApp = express()
    inviteApp.use(express.json())
    inviteApp.use('/auth', auth.router({ baseUrl: 'https://app.example.com' }))

    // First an authenticated user to do the inviting
    const inviterReg = await request(inviteApp).post('/auth/register').send({
      email: 'inviter@example.com',
      password: 'inviterpass123',
    })
    const inviterToken = inviterReg.body.token

    // Send the invitation
    const inviteRes = await request(inviteApp)
      .post('/auth/invite')
      .set('Authorization', `Bearer ${inviterToken}`)
      .send({ email: 'invited@example.com', role: 'editor' })
    expect(inviteRes.status).toBe(200)
    expect(capture.sent).toHaveLength(1)
    expect(capture.sent[0]!.html).toContain('https://app.example.com/accept-invitation?token=')

    const tokenMatch = capture.sent[0]!.html.match(/token=([a-f0-9]+)/)!
    const rawToken = tokenMatch[1]!

    // Accept the invitation
    const acceptRes = await request(inviteApp).post('/auth/accept-invitation').send({
      token: rawToken,
      password: 'invitedpass123',
    })
    expect(acceptRes.status).toBe(200)
    expect(acceptRes.body.user.email).toBe('invited@example.com')
    expect(acceptRes.body.user.role).toBe('editor')
    expect(acceptRes.body.token).toBeTruthy()
  })
})

// ---- 0.10: refresh tokens and CSRF ----

// Tiny inline cookie-parser (the express middleware crashes vitest in some setups; this is enough).
function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [k, ...rest] = c.trim().split('=')
      return [k!, rest.join('=')]
    }),
  )
}

describeIf('@authcore/express — refresh tokens', () => {
  beforeEach(async () => {
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
  })

  it('register returns refreshToken in api mode', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '15m', refreshExpiresIn: '30d' },
    })
    const app2 = express()
    app2.use(express.json())
    app2.use('/auth', auth.router())

    const res = await request(app2).post('/auth/register').send({
      email: 'refresh@example.com',
      password: 'refreshpass123',
    })
    expect(res.status).toBe(201)
    expect(res.body.token).toBeTruthy()
    expect(res.body.refreshToken).toBeTruthy()
    expect(res.body.refreshToken).toMatch(/^[a-f0-9]{64}$/)
  })

  it('POST /refresh rotates the refresh token and returns a new JWT', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '15m' },
    })
    const app2 = express()
    app2.use(express.json())
    app2.use('/auth', auth.router())

    const reg = await request(app2).post('/auth/register').send({
      email: 'rot@example.com',
      password: 'rotpass123',
    })
    const oldRefresh = reg.body.refreshToken as string

    const refreshRes = await request(app2).post('/auth/refresh').send({ refreshToken: oldRefresh })
    expect(refreshRes.status).toBe(200)
    expect(refreshRes.body.token).toBeTruthy()
    expect(refreshRes.body.refreshToken).toBeTruthy()
    expect(refreshRes.body.refreshToken).not.toBe(oldRefresh) // rotation

    // Old refresh token is now invalid
    const reused = await request(app2).post('/auth/refresh').send({ refreshToken: oldRefresh })
    expect(reused.status).toBe(401)
    expect(reused.body.code).toBe('INVALID_TOKEN')
  })

  it('POST /revoke makes the refresh token unusable', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET },
    })
    const app2 = express()
    app2.use(express.json())
    app2.use('/auth', auth.router())

    const reg = await request(app2).post('/auth/register').send({
      email: 'revoke@example.com',
      password: 'revokepass123',
    })
    const refresh = reg.body.refreshToken as string

    const revRes = await request(app2).post('/auth/revoke').send({ refreshToken: refresh })
    expect(revRes.status).toBe(200)

    const tryRefresh = await request(app2).post('/auth/refresh').send({ refreshToken: refresh })
    expect(tryRefresh.status).toBe(401)
  })

  it('POST /refresh with missing token returns 401', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET },
    })
    const app2 = express()
    app2.use(express.json())
    app2.use('/auth', auth.router())

    const res = await request(app2).post('/auth/refresh').send({})
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_TOKEN')
  })

  it('cookie mode: register sets refresh cookie; /refresh reads it', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET },
    })
    const cookieApp = express()
    cookieApp.use(express.json())
    cookieApp.use((req, _res, next) => {
      req.cookies = parseCookies(req.headers.cookie)
      next()
    })
    cookieApp.use('/auth', auth.router({ useCookies: true }))

    const reg = await request(cookieApp).post('/auth/register').send({
      email: 'ckrefresh@example.com',
      password: 'ckpass123',
    })
    expect(reg.status).toBe(201)
    expect(reg.body.token).toBeUndefined()
    expect(reg.body.refreshToken).toBeUndefined()
    const setCookie = reg.headers['set-cookie']!
    const cookieNames = setCookie.map((c: string) => c.split('=')[0])
    expect(cookieNames).toContain('authcore_token')
    expect(cookieNames).toContain('authcore_token_refresh')

    // Bundle all set-cookie pairs for /refresh
    const cookieHeader = setCookie.map((c: string) => c.split(';')[0]).join('; ')
    const refreshRes = await request(cookieApp)
      .post('/auth/refresh')
      .set('Cookie', cookieHeader)
    expect(refreshRes.status).toBe(200)
    const newSetCookie = refreshRes.headers['set-cookie']!
    expect(newSetCookie.some((c: string) => c.startsWith('authcore_token='))).toBe(true)
    expect(newSetCookie.some((c: string) => c.startsWith('authcore_token_refresh='))).toBe(true)
  })

  it('logout revokes refresh token (idempotent) and clears cookies', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET },
    })
    const app2 = express()
    app2.use(express.json())
    app2.use((req, _res, next) => {
      req.cookies = parseCookies(req.headers.cookie)
      next()
    })
    app2.use('/auth', auth.router({ useCookies: true }))

    const reg = await request(app2).post('/auth/register').send({
      email: 'logout@example.com',
      password: 'logoutpass123',
    })
    const setCookie = reg.headers['set-cookie']!
    const cookieHeader = setCookie.map((c: string) => c.split(';')[0]).join('; ')

    const logoutRes = await request(app2).post('/auth/logout').set('Cookie', cookieHeader)
    expect(logoutRes.status).toBe(200)
    const cleared = logoutRes.headers['set-cookie']!
    // Both auth + refresh cookies cleared (Max-Age=0 or similar from clearCookie)
    expect(cleared.some((c: string) => c.startsWith('authcore_token='))).toBe(true)
    expect(cleared.some((c: string) => c.startsWith('authcore_token_refresh='))).toBe(true)

    // The refresh token is now revoked — re-using it fails
    const refreshCookie = setCookie.find((c: string) => c.startsWith('authcore_token_refresh='))!
    const tryRefresh = await request(app2)
      .post('/auth/refresh')
      .set('Cookie', refreshCookie.split(';')[0]!)
    expect(tryRefresh.status).toBe(401)
  })
})

describeIf('@authcore/express — CSRF (opt-in)', () => {
  beforeEach(async () => {
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
  })

  it('with csrf: true, register sets the authcore_token_csrf cookie', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
    })
    const csrfApp = express()
    csrfApp.use(express.json())
    csrfApp.use((req, _res, next) => {
      req.cookies = parseCookies(req.headers.cookie)
      next()
    })
    csrfApp.use('/auth', auth.router({ useCookies: true }))

    const reg = await request(csrfApp).post('/auth/register').send({
      email: 'csrf@example.com',
      password: 'csrfpass123',
    })
    const setCookie = reg.headers['set-cookie']!
    const csrfCookie = setCookie.find((c: string) => c.startsWith('authcore_token_csrf='))
    expect(csrfCookie).toBeTruthy()
    // CSRF cookie must NOT be httpOnly (client JS reads it)
    expect(csrfCookie!.toLowerCase()).not.toContain('httponly')
  })

  it('state-changing request without X-CSRF-Token header returns 403 when csrf cookie is present', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
    })
    const csrfApp = express()
    csrfApp.use(express.json())
    csrfApp.use((req, _res, next) => {
      req.cookies = parseCookies(req.headers.cookie)
      next()
    })
    csrfApp.use('/auth', auth.router({ useCookies: true }))

    // First register to establish the CSRF cookie
    const reg = await request(csrfApp).post('/auth/register').send({
      email: 'csrf2@example.com',
      password: 'csrfpass123',
    })
    const setCookie = reg.headers['set-cookie']!
    const cookieHeader = setCookie.map((c: string) => c.split(';')[0]).join('; ')

    // Subsequent POST without the header should be rejected
    const blocked = await request(csrfApp)
      .post('/auth/refresh')
      .set('Cookie', cookieHeader)
      .send({})
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('CSRF_INVALID')
  })

  it('state-changing request with matching X-CSRF-Token header passes', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
    })
    const csrfApp = express()
    csrfApp.use(express.json())
    csrfApp.use((req, _res, next) => {
      req.cookies = parseCookies(req.headers.cookie)
      next()
    })
    csrfApp.use('/auth', auth.router({ useCookies: true }))

    const reg = await request(csrfApp).post('/auth/register').send({
      email: 'csrf3@example.com',
      password: 'csrfpass123',
    })
    const setCookie = reg.headers['set-cookie']!
    const cookieHeader = setCookie.map((c: string) => c.split(';')[0]).join('; ')
    const csrfPair = setCookie.find((c: string) => c.startsWith('authcore_token_csrf='))!
    const csrfValue = csrfPair.split(';')[0]!.split('=')[1]!

    const allowed = await request(csrfApp)
      .post('/auth/refresh')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfValue)
      .send({})
    // Note: refresh body is empty but the request itself was NOT blocked by CSRF;
    // it returns 401 from missing refresh token, which is the auth path, not 403 from CSRF.
    expect(allowed.status).toBe(401)
    expect(allowed.body.code).toBe('INVALID_TOKEN')
  })

  it('GET requests skip CSRF check', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
    })
    const csrfApp = express()
    csrfApp.use(express.json())
    csrfApp.use((req, _res, next) => {
      req.cookies = parseCookies(req.headers.cookie)
      next()
    })
    csrfApp.use('/auth', auth.router({ useCookies: true }))

    const reg = await request(csrfApp).post('/auth/register').send({
      email: 'csrfget@example.com',
      password: 'csrfpass123',
    })
    const setCookie = reg.headers['set-cookie']!
    const cookieHeader = setCookie.map((c: string) => c.split(';')[0]).join('; ')

    // GET /me with auth cookie but NO X-CSRF-Token — must succeed
    const meRes = await request(csrfApp).get('/auth/me').set('Cookie', cookieHeader)
    expect(meRes.status).toBe(200)
  })

  it('with csrf: false (default), no CSRF cookie set; no header required', async () => {
    const auth = createAuth({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: AUTH_SECRET },
    })
    const app2 = express()
    app2.use(express.json())
    app2.use((req, _res, next) => {
      req.cookies = parseCookies(req.headers.cookie)
      next()
    })
    app2.use('/auth', auth.router({ useCookies: true }))

    const reg = await request(app2).post('/auth/register').send({
      email: 'nocsrf@example.com',
      password: 'pass123456',
    })
    const setCookie = reg.headers['set-cookie']!
    expect(setCookie.some((c: string) => c.startsWith('authcore_token_csrf='))).toBe(false)
  })
})
