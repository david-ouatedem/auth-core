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

dotenv.config({ path: resolve(process.cwd(), '../../.env') })

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
