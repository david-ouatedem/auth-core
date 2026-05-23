/**
 * Integration tests for @authcore/nestjs
 *
 * Prerequisites:
 *   docker compose up -d   (starts Postgres on port 5433)
 *   pnpm --filter @authcore/prisma-adapter db:push
 *
 * Tests use a real Postgres DB and a real NestJS app.
 * They are skipped automatically if DATABASE_URL is not set.
 */
import 'reflect-metadata'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { Controller, Get, UseGuards, Module } from '@nestjs/common'
import request from 'supertest'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { AuthModule } from '../auth.module.js'
import { AuthGuard } from '../auth.guard.js'
import { RolesGuard } from '../roles.guard.js'
import { CurrentUser, Roles } from '../decorators.js'
import type { PublicUser } from '@authcore/core'
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

// Test controllers for custom route protection
@Controller('dashboard')
@UseGuards(AuthGuard)
class DashboardController {
  @Get()
  getDashboard(@CurrentUser() user: PublicUser) {
    return { user }
  }
}

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
class AdminController {
  @Get()
  getAdmin(@CurrentUser() user: PublicUser) {
    return { message: 'Admin area', user }
  }
}

@Module({
  controllers: [DashboardController, AdminController],
})
class TestAppModule {}

let prisma: PrismaClient
let app: INestApplication

describeIf('@authcore/nestjs integration', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    })
    await prisma.$connect()

    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.register({
          db: prismaAdapter(prisma),
          session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
        }),
        TestAppModule,
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
  })

  // ---- Registration ----

  describe('POST /auth/register', () => {
    it('creates a user and returns 201 with user + token', async () => {
      const res = await request(app.getHttpServer()).post('/auth/register').send({
        email: 'alice@example.com',
        password: 'securepassword123',
      })

      expect(res.status).toBe(201)
      expect(res.body.user.email).toBe('alice@example.com')
      expect(res.body.user.emailVerified).toBe(false)
      expect(res.body.user.role).toBe('user')
      expect(res.body.token).toBeTruthy()
      expect(res.body.user).not.toHaveProperty('passwordHash')
    })

    it('returns 409 if email is already taken', async () => {
      await request(app.getHttpServer()).post('/auth/register').send({
        email: 'alice@example.com',
        password: 'securepassword123',
      })

      const res = await request(app.getHttpServer()).post('/auth/register').send({
        email: 'alice@example.com',
        password: 'anotherpassword123',
      })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('EMAIL_EXISTS')
    })

    it('returns 400 on invalid email', async () => {
      const res = await request(app.getHttpServer()).post('/auth/register').send({
        email: 'not-an-email',
        password: 'password123',
      })

      expect(res.status).toBe(400)
      expect(res.body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 on short password', async () => {
      const res = await request(app.getHttpServer()).post('/auth/register').send({
        email: 'user@example.com',
        password: 'short',
      })

      expect(res.status).toBe(400)
    })
  })

  // ---- Login ----

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/auth/register').send({
        email: 'bob@example.com',
        password: 'mypassword123',
      })
    })

    it('returns 200 with user + token for valid credentials', async () => {
      const res = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'bob@example.com',
        password: 'mypassword123',
      })

      expect(res.status).toBe(200)
      expect(res.body.user.email).toBe('bob@example.com')
      expect(res.body.token).toBeTruthy()
      expect(res.body.user).not.toHaveProperty('passwordHash')
    })

    it('returns 401 for wrong password', async () => {
      const res = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'bob@example.com',
        password: 'wrongpassword',
      })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 401 for non-existent email', async () => {
      const res = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'nobody@example.com',
        password: 'password123',
      })

      expect(res.status).toBe(401)
    })
  })

  // ---- Logout ----

  describe('POST /auth/logout', () => {
    it('returns 200 with a logout message', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout')
      expect(res.status).toBe(200)
      expect(res.body.message).toMatch(/logged out/i)
    })
  })

  // ---- Protected route /auth/me ----

  describe('GET /auth/me', () => {
    it('returns the user for a valid token', async () => {
      const registerRes = await request(app.getHttpServer()).post('/auth/register').send({
        email: 'carol@example.com',
        password: 'mypassword123',
      })
      const { token } = registerRes.body as { token: string }

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.email).toBe('carol@example.com')
    })

    it('returns 401 with no token', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me')
      expect(res.status).toBe(401)
    })

    it('returns 401 with a bad token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer garbage.token.value')
      expect(res.status).toBe(401)
    })
  })

  // ---- Protected custom route /dashboard ----

  describe('GET /dashboard (protected via AuthGuard)', () => {
    it('returns user data for authenticated request', async () => {
      const registerRes = await request(app.getHttpServer()).post('/auth/register').send({
        email: 'dave@example.com',
        password: 'mypassword123',
      })
      const { token } = registerRes.body as { token: string }

      const res = await request(app.getHttpServer())
        .get('/dashboard')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.user.email).toBe('dave@example.com')
    })

    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/dashboard')
      expect(res.status).toBe(401)
    })
  })

  // ---- RBAC: /admin (requires admin role) ----

  describe('GET /admin (protected via AuthGuard + RolesGuard)', () => {
    it('returns 403 for a regular user', async () => {
      const registerRes = await request(app.getHttpServer()).post('/auth/register').send({
        email: 'regular@example.com',
        password: 'mypassword123',
      })
      const { token } = registerRes.body as { token: string }

      const res = await request(app.getHttpServer())
        .get('/admin')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(403)
    })
  })

  // ---- Full auth flow ----

  describe('Full auth flow', () => {
    it('register -> login -> /me all work end-to-end', async () => {
      // 1. Register
      const regRes = await request(app.getHttpServer()).post('/auth/register').send({
        email: 'fullflow@example.com',
        password: 'password12345',
      })
      expect(regRes.status).toBe(201)

      // 2. Login
      const loginRes = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'fullflow@example.com',
        password: 'password12345',
      })
      expect(loginRes.status).toBe(200)
      const { token } = loginRes.body as { token: string }

      // 3. /me with login token
      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
      expect(meRes.status).toBe(200)
      expect(meRes.body.email).toBe('fullflow@example.com')
      expect(meRes.body.role).toBe('user')
    })
  })

  // ---- RolesGuard happy path: admin sees /admin ----

  describe('GET /admin happy path (admin role)', () => {
    it('returns 200 for an admin user', async () => {
      await request(app.getHttpServer()).post('/auth/register').send({
        email: 'happy-admin@example.com',
        password: 'adminpass123',
      })
      await prisma.user.update({
        where: { email: 'happy-admin@example.com' },
        data: { role: 'admin' },
      })
      // Re-login to get a token carrying the admin role
      const loginRes = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'happy-admin@example.com',
        password: 'adminpass123',
      })
      const { token } = loginRes.body as { token: string }

      const res = await request(app.getHttpServer())
        .get('/admin')
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.user.role).toBe('admin')
    })
  })
})

// ---- Extended: forgot-password security regression + invite happy path ----

describeIf('@authcore/nestjs — extended flows', () => {
  let extApp: INestApplication
  let captureProvider: ReturnType<typeof createCaptureEmail>

  beforeAll(async () => {
    captureProvider = createCaptureEmail()
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.register({
          db: prismaAdapter(prisma),
          session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
          email: { provider: captureProvider.provider, from: 'auth@test.com' },
          features: ['passwordReset', 'invitation'],
          baseUrl: 'https://app.example.com',
        }),
      ],
    }).compile()
    extApp = moduleRef.createNestApplication()
    await extApp.init()
  })

  afterAll(async () => {
    await extApp.close()
  })

  beforeEach(async () => {
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
    captureProvider.sent.length = 0
  })

  it('forgot-password / reset-password E2E does NOT leak AUTH_SECRET', async () => {
    await request(extApp.getHttpServer()).post('/auth/register').send({
      email: 'reset@example.com',
      password: 'originalpass123',
    })

    const forgotRes = await request(extApp.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'reset@example.com' })
    expect(forgotRes.status).toBe(201)
    expect(captureProvider.sent).toHaveLength(1)

    const email = captureProvider.sent[0]!
    expect(email.html).toContain('https://app.example.com/auth/reset-password?token=')
    expect(email.html).not.toContain(AUTH_SECRET)
    expect(email.text).not.toContain(AUTH_SECRET)

    const rawToken = email.html.match(/token=([a-f0-9]+)/)![1]!

    const resetRes = await request(extApp.getHttpServer()).post('/auth/reset-password').send({
      token: rawToken,
      password: 'newpassword456',
    })
    expect(resetRes.status).toBe(201)

    const loginRes = await request(extApp.getHttpServer()).post('/auth/login').send({
      email: 'reset@example.com',
      password: 'newpassword456',
    })
    expect(loginRes.status).toBe(200)
  })

  it('invitation flow: invite + accept-invitation E2E', async () => {
    const inviterReg = await request(extApp.getHttpServer()).post('/auth/register').send({
      email: 'inviter@example.com',
      password: 'inviterpass123',
    })
    const inviterToken = inviterReg.body.token

    const inviteRes = await request(extApp.getHttpServer())
      .post('/auth/invite')
      .set('Authorization', `Bearer ${inviterToken}`)
      .send({ email: 'invited@example.com', role: 'editor' })
    expect(inviteRes.status).toBe(201)
    expect(captureProvider.sent[0]!.html).toContain('https://app.example.com/auth/accept-invitation?token=')

    const rawToken = captureProvider.sent[0]!.html.match(/token=([a-f0-9]+)/)![1]!

    const acceptRes = await request(extApp.getHttpServer()).post('/auth/accept-invitation').send({
      token: rawToken,
      password: 'invitedpass123',
    })
    expect(acceptRes.status).toBe(201)
    expect(acceptRes.body.user.email).toBe('invited@example.com')
    expect(acceptRes.body.user.role).toBe('editor')
    expect(acceptRes.body.token).toBeTruthy()
  })
})

// ---- Extended: cookie mode + custom cookieName ----

describeIf('@authcore/nestjs — cookie mode', () => {
  let cookieApp: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.register({
          db: prismaAdapter(prisma),
          session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h' },
          useCookies: true,
        }),
      ],
    }).compile()
    cookieApp = moduleRef.createNestApplication()
    // Add cookie-parser middleware so request.cookies is populated
    const cookieParser = (await import('cookie-parser')).default
    cookieApp.use(cookieParser())
    await cookieApp.init()
  })

  afterAll(async () => {
    await cookieApp.close()
  })

  beforeEach(async () => {
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
  })

  it('login sets cookie and /me reads it', async () => {
    const regRes = await request(cookieApp.getHttpServer()).post('/auth/register').send({
      email: 'cookie@example.com',
      password: 'cookiepass123',
    })
    expect(regRes.status).toBe(201)
    expect(regRes.body.token).toBeUndefined()
    const setCookie = regRes.headers['set-cookie']!
    expect(setCookie[0]).toMatch(/^authcore_token=/)

    const meRes = await request(cookieApp.getHttpServer())
      .get('/auth/me')
      .set('Cookie', setCookie)
    expect(meRes.status).toBe(200)
    expect(meRes.body.email).toBe('cookie@example.com')
  })
})

describeIf('@authcore/nestjs — custom cookieName', () => {
  let customApp: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.register({
          db: prismaAdapter(prisma),
          session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '1h', cookieName: 'my_token' },
          useCookies: true,
        }),
      ],
    }).compile()
    customApp = moduleRef.createNestApplication()
    const cookieParser = (await import('cookie-parser')).default
    customApp.use(cookieParser())
    await customApp.init()
  })

  afterAll(async () => {
    await customApp.close()
  })

  beforeEach(async () => {
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
  })

  it('login writes AND /me reads the custom cookie name', async () => {
    const regRes = await request(customApp.getHttpServer()).post('/auth/register').send({
      email: 'custom@example.com',
      password: 'custompass123',
    })
    expect(regRes.status).toBe(201)
    const setCookie = regRes.headers['set-cookie']!
    expect(setCookie[0]).toMatch(/^my_token=/)

    const meRes = await request(customApp.getHttpServer())
      .get('/auth/me')
      .set('Cookie', setCookie)
    expect(meRes.status).toBe(200)
    expect(meRes.body.email).toBe('custom@example.com')
  })
})

// ---- 0.10: refresh tokens ----

describeIf('@authcore/nestjs — refresh tokens', () => {
  let refreshApp: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.register({
          db: prismaAdapter(prisma),
          session: { strategy: 'jwt', secret: AUTH_SECRET, expiresIn: '15m', refreshExpiresIn: '30d' },
        }),
      ],
    }).compile()
    refreshApp = moduleRef.createNestApplication()
    await refreshApp.init()
  })

  afterAll(async () => {
    await refreshApp.close()
  })

  beforeEach(async () => {
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
  })

  it('register returns a 64-char hex refreshToken', async () => {
    const res = await request(refreshApp.getHttpServer()).post('/auth/register').send({
      email: 'refresh@example.com',
      password: 'refreshpass123',
    })
    expect(res.status).toBe(201)
    expect(res.body.refreshToken).toMatch(/^[a-f0-9]{64}$/)
  })

  it('POST /auth/refresh rotates the refresh token; old token rejected on reuse', async () => {
    const reg = await request(refreshApp.getHttpServer()).post('/auth/register').send({
      email: 'rot@example.com',
      password: 'rotpass123',
    })
    const oldRefresh = reg.body.refreshToken as string

    const refRes = await request(refreshApp.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh })
    expect(refRes.status).toBe(200)
    expect(refRes.body.refreshToken).not.toBe(oldRefresh)

    const reused = await request(refreshApp.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefresh })
    expect(reused.status).toBe(401)
    expect(reused.body.code).toBe('INVALID_TOKEN')
  })

  it('POST /auth/refresh without refreshToken returns 401', async () => {
    const res = await request(refreshApp.getHttpServer()).post('/auth/refresh').send({})
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_TOKEN')
  })

  it('POST /auth/revoke makes the refresh token unusable', async () => {
    const reg = await request(refreshApp.getHttpServer()).post('/auth/register').send({
      email: 'revoke@example.com',
      password: 'revokepass123',
    })
    const refresh = reg.body.refreshToken as string

    const rev = await request(refreshApp.getHttpServer())
      .post('/auth/revoke')
      .send({ refreshToken: refresh })
    expect(rev.status).toBe(200)

    const tryRefresh = await request(refreshApp.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refresh })
    expect(tryRefresh.status).toBe(401)
  })
})

// ---- 0.10: CSRF (opt-in) ----

describeIf('@authcore/nestjs — CSRF (opt-in)', () => {
  let csrfApp: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.register({
          db: prismaAdapter(prisma),
          session: { strategy: 'jwt', secret: AUTH_SECRET, csrf: true },
          useCookies: true,
        }),
      ],
    }).compile()
    csrfApp = moduleRef.createNestApplication()
    const cookieParser = (await import('cookie-parser')).default
    csrfApp.use(cookieParser())
    // Bind CsrfGuard globally
    const { CsrfGuard } = await import('../csrf.guard.js')
    csrfApp.useGlobalGuards(csrfApp.get(CsrfGuard))
    await csrfApp.init()
  })

  afterAll(async () => {
    await csrfApp.close()
  })

  beforeEach(async () => {
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
  })

  it('register sets the authcore_token_csrf cookie (not httpOnly)', async () => {
    const res = await request(csrfApp.getHttpServer()).post('/auth/register').send({
      email: 'csrf@example.com',
      password: 'csrfpass123',
    })
    expect(res.status).toBe(201)
    const csrfCookie = (res.headers['set-cookie'] as string[]).find((c) =>
      c.startsWith('authcore_token_csrf='),
    )
    expect(csrfCookie).toBeTruthy()
    expect(csrfCookie!.toLowerCase()).not.toContain('httponly')
  })

  it('state-changing request without X-CSRF-Token returns 403', async () => {
    const reg = await request(csrfApp.getHttpServer()).post('/auth/register').send({
      email: 'csrf2@example.com',
      password: 'csrfpass123',
    })
    const setCookie = reg.headers['set-cookie'] as string[]
    const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ')

    const blocked = await request(csrfApp.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookieHeader)
      .send({})
    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe('CSRF_INVALID')
  })

  it('matching X-CSRF-Token passes the guard', async () => {
    const reg = await request(csrfApp.getHttpServer()).post('/auth/register').send({
      email: 'csrf3@example.com',
      password: 'csrfpass123',
    })
    const setCookie = reg.headers['set-cookie'] as string[]
    const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ')
    const csrfPair = setCookie.find((c) => c.startsWith('authcore_token_csrf='))!
    const csrfValue = csrfPair.split(';')[0]!.split('=')[1]!

    const allowed = await request(csrfApp.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookieHeader)
      .set('X-CSRF-Token', csrfValue)
      .send({})
    // CSRF passed → auth-level INVALID_TOKEN (no refresh body)
    expect(allowed.status).toBe(401)
    expect(allowed.body.code).toBe('INVALID_TOKEN')
  })

  it('GET requests skip the CSRF check', async () => {
    const reg = await request(csrfApp.getHttpServer()).post('/auth/register').send({
      email: 'csrfget@example.com',
      password: 'csrfpass123',
    })
    const setCookie = reg.headers['set-cookie'] as string[]
    const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ')

    const meRes = await request(csrfApp.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookieHeader)
    expect(meRes.status).toBe(200)
  })
})
