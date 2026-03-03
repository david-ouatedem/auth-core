/**
 * Integration tests for @authcore/prisma-adapter
 *
 * Prerequisites:
 *   docker compose up -d   (starts Postgres on port 5433)
 *   pnpm --filter @authcore/prisma-adapter db:push
 *
 * These tests use a real Postgres database.
 * They are skipped automatically if DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '../index.js'
import { hashToken } from '@authcore/core'
import * as dotenv from 'dotenv'
import { resolve } from 'node:path'

dotenv.config({ path: resolve(process.cwd(), '../../.env') })

const DATABASE_URL = process.env['DATABASE_URL']

// Skip integration tests if no DB is configured
const describeIf = DATABASE_URL ? describe : describe.skip

let prisma: PrismaClient

describeIf('prismaAdapter (integration)', () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    })
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // Clean slate for each test
    await prisma.token.deleteMany()
    await prisma.user.deleteMany()
  })

  const adapter = () => prismaAdapter(prisma)

  describe('User operations', () => {
    it('creates and finds a user by email', async () => {
      const db = adapter()
      const user = await db.createUser({
        email: 'test@example.com',
        passwordHash: 'hashedpw',
      })

      expect(user.email).toBe('test@example.com')
      expect(user.emailVerified).toBe(false)
      expect(user.id).toBeTruthy()

      const found = await db.findUserByEmail('test@example.com')
      expect(found).not.toBeNull()
      expect(found?.id).toBe(user.id)
    })

    it('returns null for a non-existent email', async () => {
      const db = adapter()
      const found = await db.findUserByEmail('nobody@example.com')
      expect(found).toBeNull()
    })

    it('finds a user by ID', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'findme@example.com', passwordHash: 'hash' })
      const found = await db.findUserById(user.id)
      expect(found?.email).toBe('findme@example.com')
    })

    it('returns null for a non-existent ID', async () => {
      const db = adapter()
      const found = await db.findUserById('00000000-0000-0000-0000-000000000000')
      expect(found).toBeNull()
    })

    it('updates a user field', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'update@example.com', passwordHash: 'hash' })
      const updated = await db.updateUser(user.id, { emailVerified: true })
      expect(updated.emailVerified).toBe(true)
    })
  })

  describe('Token operations', () => {
    it('creates and finds a token by raw value', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'token@example.com', passwordHash: 'hash' })

      const rawToken = 'my-raw-token-value-for-testing'
      const hashedToken = hashToken(rawToken)

      await db.createToken({
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        token: hashedToken,
        expiresAt: new Date(Date.now() + 60_000),
      })

      const found = await db.findToken(rawToken, 'EMAIL_VERIFICATION')
      expect(found).not.toBeNull()
      expect(found?.userId).toBe(user.id)
      expect(found?.type).toBe('EMAIL_VERIFICATION')
    })

    it('returns null when token type does not match', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'typematch@example.com', passwordHash: 'hash' })

      const rawToken = 'another-raw-token'
      const hashedToken = hashToken(rawToken)

      await db.createToken({
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        token: hashedToken,
        expiresAt: new Date(Date.now() + 60_000),
      })

      // Looking for PASSWORD_RESET but stored as EMAIL_VERIFICATION
      const found = await db.findToken(rawToken, 'PASSWORD_RESET')
      expect(found).toBeNull()
    })

    it('returns null for a non-existent token', async () => {
      const db = adapter()
      const found = await db.findToken('nonexistent-token', 'PASSWORD_RESET')
      expect(found).toBeNull()
    })

    it('deletes a token by ID', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'delete@example.com', passwordHash: 'hash' })

      const rawToken = 'token-to-delete'
      const hashedToken = hashToken(rawToken)

      const token = await db.createToken({
        userId: user.id,
        type: 'PASSWORD_RESET',
        token: hashedToken,
        expiresAt: new Date(Date.now() + 60_000),
      })

      await db.deleteToken(token.id)
      const found = await db.findToken(rawToken, 'PASSWORD_RESET')
      expect(found).toBeNull()
    })

    it('deletes expired tokens', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'expired@example.com', passwordHash: 'hash' })

      // Create an expired token
      await db.createToken({
        userId: user.id,
        type: 'SESSION',
        token: hashToken('expired-raw-token'),
        expiresAt: new Date(Date.now() - 1000), // already expired
      })

      // Create a valid token
      await db.createToken({
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        token: hashToken('valid-raw-token'),
        expiresAt: new Date(Date.now() + 60_000),
      })

      await db.deleteExpiredTokens()

      const expired = await db.findToken('expired-raw-token', 'SESSION')
      const valid = await db.findToken('valid-raw-token', 'EMAIL_VERIFICATION')

      expect(expired).toBeNull()
      expect(valid).not.toBeNull()
    })
  })
})
