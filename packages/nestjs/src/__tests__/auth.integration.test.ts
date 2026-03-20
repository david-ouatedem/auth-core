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

dotenv.config({ path: resolve(process.cwd(), '../../.env') })

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
      expect(res.status).toBe(201) // NestJS POST default is 201
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

    it('returns 403 with no token', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me')
      expect(res.status).toBe(403)
    })

    it('returns 403 with a bad token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer garbage.token.value')
      expect(res.status).toBe(403)
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

    it('returns 403 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/dashboard')
      expect(res.status).toBe(403)
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
})
