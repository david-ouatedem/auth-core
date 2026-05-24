/**
 * Integration tests for `@authcore/drizzle-adapter/sqlite`.
 *
 * Uses better-sqlite3 with an in-memory database — runs unconditionally and
 * doesn't need a Docker container. Mirrors the prismaAdapter integration
 * suite so we demonstrate the two adapters implement the same contract.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { hashToken } from '@authcore/core'
import { drizzleAdapter, users, tokens, oauthAccounts } from '../index.js'

/**
 * better-sqlite3 ships prebuilt binaries for the LTS Node ABIs. On bleeding-edge
 * Node versions (e.g. v24) and on Windows without Visual Studio build tools,
 * the import succeeds but the native binding fails to load at instantiation.
 * We probe at module load by actually creating an in-memory DB; if that throws
 * we skip the suite. CI (Ubuntu, Node 18/20/22) always has working prebuilts.
 */
let DatabaseCtor: typeof Database | null = null
let drizzleFn: typeof import('drizzle-orm/better-sqlite3').drizzle | null = null
try {
  const dbModule = await import('better-sqlite3')
  const drModule = await import('drizzle-orm/better-sqlite3')
  // Force the native binding to load NOW so the catch fires here, not later.
  const probe = new dbModule.default(':memory:')
  probe.close()
  DatabaseCtor = dbModule.default
  drizzleFn = drModule.drizzle
} catch {
  // Native binding missing — tests skip below.
}
const describeIf = DatabaseCtor ? describe : describe.skip

const SQL_INIT = `
CREATE TABLE users (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  email_verified integer NOT NULL DEFAULT 0,
  role text NOT NULL DEFAULT 'user',
  two_factor_enabled integer NOT NULL DEFAULT 0,
  two_factor_secret text,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE TABLE tokens (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at integer NOT NULL,
  created_at integer NOT NULL
);
CREATE INDEX tokens_type_expires_idx ON tokens(type, expires_at);
CREATE INDEX tokens_user_id_idx ON tokens(user_id);
CREATE TABLE oauth_accounts (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL
);
CREATE UNIQUE INDEX oauth_accounts_provider_account_idx ON oauth_accounts(provider, provider_account_id);
CREATE INDEX oauth_accounts_user_id_idx ON oauth_accounts(user_id);
PRAGMA foreign_keys = ON;
`

let sqlite: Database.Database
let db: BetterSQLite3Database
const adapter = () => drizzleAdapter(db)

describeIf('@authcore/drizzle-adapter/sqlite (integration)', () => {
  beforeAll(() => {
    sqlite = new DatabaseCtor!(':memory:')
    sqlite.exec(SQL_INIT)
    db = drizzleFn!(sqlite)
  })

  beforeEach(() => {
    sqlite.exec('DELETE FROM tokens; DELETE FROM oauth_accounts; DELETE FROM users;')
  })

  describe('User operations', () => {
    it('creates and finds a user by email', async () => {
      const db = adapter()
      const user = await db.createUser({
        email: 'test@example.com',
        passwordHash: 'hashedpw',
      })

      expect(user.email).toBe('test@example.com')
      expect(user.emailVerified).toBe(false)
      expect(user.twoFactorEnabled).toBe(false)
      expect(user.twoFactorSecret).toBeNull()
      expect(user.role).toBe('user')
      expect(user.id).toBeTruthy()

      const found = await db.findUserByEmail('test@example.com')
      expect(found?.id).toBe(user.id)
    })

    it('returns null for a non-existent email', async () => {
      expect(await adapter().findUserByEmail('nobody@example.com')).toBeNull()
    })

    it('returns null for a non-existent ID', async () => {
      expect(await adapter().findUserById('00000000-0000-0000-0000-000000000000')).toBeNull()
    })

    it('updates a single field without touching the others', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'u@example.com', passwordHash: 'h', role: 'admin' })
      const updated = await db.updateUser(user.id, { emailVerified: true })
      expect(updated.emailVerified).toBe(true)
      expect(updated.role).toBe('admin') // untouched
    })

    it('updates twoFactorEnabled + twoFactorSecret', async () => {
      const db = adapter()
      const user = await db.createUser({ email: '2fa@example.com', passwordHash: 'h' })
      const enrolled = await db.updateUser(user.id, {
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      })
      expect(enrolled.twoFactorEnabled).toBe(true)
      expect(enrolled.twoFactorSecret).toBe('JBSWY3DPEHPK3PXP')

      const cleared = await db.updateUser(user.id, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      })
      expect(cleared.twoFactorEnabled).toBe(false)
      expect(cleared.twoFactorSecret).toBeNull()
    })
  })

  describe('Token operations', () => {
    it('creates a token, finds it by raw value, and rejects a wrong type', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 't@example.com', passwordHash: 'h' })

      const raw = 'my-raw-token'
      await db.createToken({
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        token: hashToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
      })

      const found = await db.findToken(raw, 'EMAIL_VERIFICATION')
      expect(found?.userId).toBe(user.id)

      const wrongType = await db.findToken(raw, 'PASSWORD_RESET')
      expect(wrongType).toBeNull()
    })

    it('deletes a single token by id', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'd@example.com', passwordHash: 'h' })
      const token = await db.createToken({
        userId: user.id,
        type: 'PASSWORD_RESET',
        token: hashToken('once'),
        expiresAt: new Date(Date.now() + 60_000),
      })
      await db.deleteToken(token.id)
      expect(await db.findToken('once', 'PASSWORD_RESET')).toBeNull()
    })

    it('deletes only matching (userId, type) tokens via deleteTokensByUserAndType', async () => {
      const db = adapter()
      const userA = await db.createUser({ email: 'a@example.com', passwordHash: 'h' })
      const userB = await db.createUser({ email: 'b@example.com', passwordHash: 'h' })

      for (const raw of ['rA1', 'rA2', 'rA3']) {
        await db.createToken({
          userId: userA.id,
          type: 'REFRESH',
          token: hashToken(raw),
          expiresAt: new Date(Date.now() + 60_000),
        })
      }
      await db.createToken({
        userId: userB.id,
        type: 'REFRESH',
        token: hashToken('rB1'),
        expiresAt: new Date(Date.now() + 60_000),
      })
      await db.createToken({
        userId: userA.id,
        type: 'PASSWORD_RESET',
        token: hashToken('prA'),
        expiresAt: new Date(Date.now() + 60_000),
      })

      await db.deleteTokensByUserAndType(userA.id, 'REFRESH')

      expect(await db.findToken('rA1', 'REFRESH')).toBeNull()
      expect(await db.findToken('rA2', 'REFRESH')).toBeNull()
      expect(await db.findToken('rA3', 'REFRESH')).toBeNull()
      expect(await db.findToken('rB1', 'REFRESH')).not.toBeNull()
      expect(await db.findToken('prA', 'PASSWORD_RESET')).not.toBeNull()
    })

    it('deleteExpiredTokens removes only past-expiry rows', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'e@example.com', passwordHash: 'h' })
      await db.createToken({
        userId: user.id,
        type: 'SESSION',
        token: hashToken('expired'),
        expiresAt: new Date(Date.now() - 1000),
      })
      await db.createToken({
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        token: hashToken('valid'),
        expiresAt: new Date(Date.now() + 60_000),
      })

      await db.deleteExpiredTokens()

      expect(await db.findToken('expired', 'SESSION')).toBeNull()
      expect(await db.findToken('valid', 'EMAIL_VERIFICATION')).not.toBeNull()
    })

    it('REFRESH and MAGIC_LINK and RECOVERY_CODE round-trip through SQLite text column', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'enums@example.com', passwordHash: 'h' })
      for (const type of ['REFRESH', 'MAGIC_LINK', 'RECOVERY_CODE'] as const) {
        await db.createToken({
          userId: user.id,
          type,
          token: hashToken(`${type}-raw`),
          expiresAt: new Date(Date.now() + 60_000),
        })
        const found = await db.findToken(`${type}-raw`, type)
        expect(found?.type).toBe(type)
      }
    })
  })

  describe('OAuthAccount operations', () => {
    it('creates + finds by (provider, providerAccountId)', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'o@example.com', passwordHash: 'h' })
      const created = await db.createOAuthAccount({
        userId: user.id,
        provider: 'google',
        providerAccountId: 'remote-1',
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600_000),
      })
      expect(created.userId).toBe(user.id)

      const found = await db.findOAuthAccount('google', 'remote-1')
      expect(found?.id).toBe(created.id)
    })

    it('updates access/refresh/expiresAt and returns the new row', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'u@example.com', passwordHash: 'h' })
      const created = await db.createOAuthAccount({
        userId: user.id,
        provider: 'google',
        providerAccountId: 'remote-2',
        accessToken: 'old',
      })
      const updated = await db.updateOAuthAccount(created.id, {
        accessToken: 'new',
        refreshToken: 'rfsh',
      })
      expect(updated.accessToken).toBe('new')
      expect(updated.refreshToken).toBe('rfsh')
    })

    it('cascade-deletes oauth accounts when the user row is removed', async () => {
      const db = adapter()
      const user = await db.createUser({ email: 'c@example.com', passwordHash: 'h' })
      await db.createOAuthAccount({
        userId: user.id,
        provider: 'google',
        providerAccountId: 'casc',
        accessToken: 'a',
      })
      // Use Drizzle directly to delete the user
      await db.deleteToken('does-not-matter-noop') // warm up
      sqlite.exec(`DELETE FROM users WHERE id = '${user.id}'`)
      expect(await db.findOAuthAccount('google', 'casc')).toBeNull()
    })

    it('enforces unique (provider, providerAccountId)', async () => {
      const db = adapter()
      const userA = await db.createUser({ email: 'ua@example.com', passwordHash: 'h' })
      const userB = await db.createUser({ email: 'ub@example.com', passwordHash: 'h' })
      await db.createOAuthAccount({
        userId: userA.id,
        provider: 'google',
        providerAccountId: 'shared',
        accessToken: 'a',
      })
      await expect(
        db.createOAuthAccount({
          userId: userB.id,
          provider: 'google',
          providerAccountId: 'shared',
          accessToken: 'a',
        }),
      ).rejects.toThrow()
    })
  })

  describe('schema sanity', () => {
    it('exports the expected Drizzle table objects', () => {
      expect(users).toBeDefined()
      expect(tokens).toBeDefined()
      expect(oauthAccounts).toBeDefined()
    })
  })
})
