/**
 * Integration tests for `@authcore/drizzle-adapter/pg`.
 *
 * Prerequisites (shared with Prisma tests):
 *   docker compose up -d   (starts Postgres on port 5433)
 *
 * Schema is created in-process from the Drizzle table definitions, so no
 * separate `drizzle-kit migrate` step is required. Tests are skipped when
 * DATABASE_URL is unset.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Pool } from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { hashToken } from '@authcore/core'
import * as dotenv from 'dotenv'
import { resolve } from 'node:path'
import { drizzleAdapter, users, tokens, oauthAccounts } from '../index.js'

dotenv.config({ path: resolve(process.cwd(), '.env') })

const DATABASE_URL = process.env['DATABASE_URL']
const describeIf = DATABASE_URL ? describe : describe.skip

let pool: Pool
let db: NodePgDatabase
const adapter = () => drizzleAdapter(db)

/**
 * Create the Drizzle tables fresh in a schema-isolated namespace so we don't
 * collide with the Prisma-managed tables also running in this DB during CI.
 */
const SCHEMA_NAME = 'drizzle_test'
const SQL_INIT = `
  DROP SCHEMA IF EXISTS ${SCHEMA_NAME} CASCADE;
  CREATE SCHEMA ${SCHEMA_NAME};
  SET search_path TO ${SCHEMA_NAME};

  CREATE TYPE authcore_token_type AS ENUM (
    'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'SESSION', 'INVITATION',
    'REFRESH', 'MAGIC_LINK', 'RECOVERY_CODE'
  );

  CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    email_verified boolean NOT NULL DEFAULT false,
    role text NOT NULL DEFAULT 'user',
    two_factor_enabled boolean NOT NULL DEFAULT false,
    two_factor_secret text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type authcore_token_type NOT NULL,
    token text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX tokens_type_expires_idx ON tokens(type, expires_at);
  CREATE INDEX tokens_user_id_idx ON tokens(user_id);

  CREATE TABLE oauth_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX oauth_accounts_provider_account_idx
    ON oauth_accounts(provider, provider_account_id);
  CREATE INDEX oauth_accounts_user_id_idx ON oauth_accounts(user_id);
`

describeIf('@authcore/drizzle-adapter/pg (integration)', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    await pool.query(SQL_INIT)
    // Pin every connection in the pool to the test schema.
    await pool.query(`ALTER ROLE CURRENT_USER SET search_path TO ${SCHEMA_NAME}`)
    db = drizzle(pool)
  })

  afterAll(async () => {
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA_NAME} CASCADE`)
    await pool.query(`ALTER ROLE CURRENT_USER RESET search_path`)
    await pool.end()
  })

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE users, tokens, oauth_accounts RESTART IDENTITY CASCADE`)
  })

  describe('User operations', () => {
    it('creates and finds a user, defaults emailVerified=false + twoFactorEnabled=false', async () => {
      const a = adapter()
      const u = await a.createUser({ email: 'pg@example.com', passwordHash: 'h' })
      expect(u.emailVerified).toBe(false)
      expect(u.twoFactorEnabled).toBe(false)
      expect(u.twoFactorSecret).toBeNull()
      expect(u.role).toBe('user')
      const found = await a.findUserByEmail('pg@example.com')
      expect(found?.id).toBe(u.id)
    })

    it('updates a single field via partial', async () => {
      const a = adapter()
      const u = await a.createUser({ email: 'upd@example.com', passwordHash: 'h' })
      const after = await a.updateUser(u.id, { emailVerified: true })
      expect(after.emailVerified).toBe(true)
    })

    it('updates twoFactorEnabled + twoFactorSecret in lockstep', async () => {
      const a = adapter()
      const u = await a.createUser({ email: '2fa-pg@example.com', passwordHash: 'h' })
      const enrolled = await a.updateUser(u.id, {
        twoFactorEnabled: true,
        twoFactorSecret: 'JBSWY3DPEHPK3PXP',
      })
      expect(enrolled.twoFactorEnabled).toBe(true)
      expect(enrolled.twoFactorSecret).toBe('JBSWY3DPEHPK3PXP')

      const cleared = await a.updateUser(u.id, {
        twoFactorEnabled: false,
        twoFactorSecret: null,
      })
      expect(cleared.twoFactorSecret).toBeNull()
    })
  })

  describe('Token operations', () => {
    it('creates + finds tokens of every type that exists in the enum', async () => {
      const a = adapter()
      const u = await a.createUser({ email: 't@example.com', passwordHash: 'h' })
      for (const type of [
        'EMAIL_VERIFICATION',
        'PASSWORD_RESET',
        'SESSION',
        'INVITATION',
        'REFRESH',
        'MAGIC_LINK',
        'RECOVERY_CODE',
      ] as const) {
        const raw = `raw-${type}`
        await a.createToken({
          userId: u.id,
          type,
          token: hashToken(raw),
          expiresAt: new Date(Date.now() + 60_000),
        })
        const found = await a.findToken(raw, type)
        expect(found?.type).toBe(type)
      }
    })

    it('returns null when type doesn\'t match', async () => {
      const a = adapter()
      const u = await a.createUser({ email: 'tm@example.com', passwordHash: 'h' })
      await a.createToken({
        userId: u.id,
        type: 'EMAIL_VERIFICATION',
        token: hashToken('x'),
        expiresAt: new Date(Date.now() + 60_000),
      })
      expect(await a.findToken('x', 'PASSWORD_RESET')).toBeNull()
    })

    it('deletes by id; deleteExpiredTokens only removes past-expiry rows', async () => {
      const a = adapter()
      const u = await a.createUser({ email: 'del@example.com', passwordHash: 'h' })
      const dead = await a.createToken({
        userId: u.id,
        type: 'SESSION',
        token: hashToken('dead'),
        expiresAt: new Date(Date.now() - 1000),
      })
      await a.createToken({
        userId: u.id,
        type: 'EMAIL_VERIFICATION',
        token: hashToken('live'),
        expiresAt: new Date(Date.now() + 60_000),
      })
      await a.deleteExpiredTokens()
      expect(await a.findToken('dead', 'SESSION')).toBeNull()
      expect(await a.findToken('live', 'EMAIL_VERIFICATION')).not.toBeNull()
      // and direct delete still works
      await a.deleteToken(dead.id) // no-op since already gone
    })

    it('deleteTokensByUserAndType narrows by both user and type', async () => {
      const a = adapter()
      const uA = await a.createUser({ email: 'ax@example.com', passwordHash: 'h' })
      const uB = await a.createUser({ email: 'bx@example.com', passwordHash: 'h' })
      for (const raw of ['x1', 'x2']) {
        await a.createToken({
          userId: uA.id,
          type: 'REFRESH',
          token: hashToken(raw),
          expiresAt: new Date(Date.now() + 60_000),
        })
      }
      await a.createToken({
        userId: uB.id,
        type: 'REFRESH',
        token: hashToken('b1'),
        expiresAt: new Date(Date.now() + 60_000),
      })
      await a.deleteTokensByUserAndType(uA.id, 'REFRESH')
      expect(await a.findToken('x1', 'REFRESH')).toBeNull()
      expect(await a.findToken('b1', 'REFRESH')).not.toBeNull()
    })
  })

  describe('OAuthAccount operations', () => {
    it('creates, finds, updates, and enforces uniqueness', async () => {
      const a = adapter()
      const uA = await a.createUser({ email: 'oa@example.com', passwordHash: 'h' })
      const uB = await a.createUser({ email: 'ob@example.com', passwordHash: 'h' })
      const acct = await a.createOAuthAccount({
        userId: uA.id,
        provider: 'google',
        providerAccountId: 'g-1',
        accessToken: 'a',
      })
      expect(await a.findOAuthAccount('google', 'g-1')).toMatchObject({ id: acct.id })
      const updated = await a.updateOAuthAccount(acct.id, { accessToken: 'b' })
      expect(updated.accessToken).toBe('b')
      await expect(
        a.createOAuthAccount({
          userId: uB.id,
          provider: 'google',
          providerAccountId: 'g-1',
          accessToken: 'a',
        }),
      ).rejects.toThrow()
    })

    it('cascade-deletes oauth accounts when the user row is removed', async () => {
      const a = adapter()
      const u = await a.createUser({ email: 'cd@example.com', passwordHash: 'h' })
      await a.createOAuthAccount({
        userId: u.id,
        provider: 'google',
        providerAccountId: 'cascade',
        accessToken: 'a',
      })
      await db.delete(users).where(sql`${users.id} = ${u.id}`)
      expect(await a.findOAuthAccount('google', 'cascade')).toBeNull()
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
