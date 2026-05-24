import { createHash } from 'node:crypto'
import { eq, and, lt } from 'drizzle-orm'
import type {
  DatabaseAdapter,
  CreateUserInput,
  CreateTokenInput,
  CreateOAuthAccountInput,
  OAuthAccount,
  TokenType,
  User,
  Token,
} from '@authcore/types'

/**
 * Loose structural type for the schema bundle. PG and SQLite schemas each
 * supply their own concretely-typed objects; the adapter only reads/writes
 * via the field names (which match across dialects).
 *
 * Typed as `any` deliberately — Drizzle's per-dialect column types differ
 * (e.g. `PgColumn` vs `SQLiteColumn`) and the operators we use (`eq`, `and`,
 * `lt`) are dialect-agnostic. Tightening this would require a 60-line
 * generic dance to recover what we already get at the call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleSchema = {
  users: any
  tokens: any
  oauthAccounts: any
}

/**
 * Minimal Drizzle DB surface we depend on. Works for both
 * `drizzle-orm/node-postgres` and `drizzle-orm/better-sqlite3` (and indeed
 * every other Drizzle dialect that supports `.returning()`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrizzleDb = any

function hashRawToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    email: row['email'] as string,
    passwordHash: row['passwordHash'] as string,
    emailVerified: Boolean(row['emailVerified']),
    role: row['role'] as string,
    twoFactorEnabled: Boolean(row['twoFactorEnabled']),
    twoFactorSecret: (row['twoFactorSecret'] as string | null) ?? null,
    createdAt: row['createdAt'] as Date,
    updatedAt: row['updatedAt'] as Date,
  }
}

function mapToken(row: Record<string, unknown>): Token {
  return {
    id: row['id'] as string,
    userId: row['userId'] as string,
    type: row['type'] as TokenType,
    token: row['token'] as string,
    expiresAt: row['expiresAt'] as Date,
    createdAt: row['createdAt'] as Date,
  }
}

function mapOAuthAccount(row: Record<string, unknown>): OAuthAccount {
  return {
    id: row['id'] as string,
    userId: row['userId'] as string,
    provider: row['provider'] as string,
    providerAccountId: row['providerAccountId'] as string,
    accessToken: row['accessToken'] as string,
    refreshToken: (row['refreshToken'] as string | null) ?? null,
    expiresAt: (row['expiresAt'] as Date | null) ?? null,
    createdAt: row['createdAt'] as Date,
    updatedAt: row['updatedAt'] as Date,
  }
}

/**
 * Create a {@link DatabaseAdapter} backed by Drizzle ORM.
 *
 * Use the dialect-specific entry points (`@authcore/drizzle-adapter/pg` or
 * `@authcore/drizzle-adapter/sqlite`) which import this helper plus the
 * matching schema. Calling this directly is only useful when you've extended
 * the bundled schema and want to pass your own.
 *
 * @param db     - A Drizzle DB instance (node-postgres, better-sqlite3, etc.)
 * @param schema - The schema bundle with `users`, `tokens`, `oauthAccounts`
 */
export function createDrizzleAdapter(db: DrizzleDb, schema: DrizzleSchema): DatabaseAdapter {
  const { users, tokens, oauthAccounts } = schema

  return {
    async findUserByEmail(email: string): Promise<User | null> {
      const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
      const row = rows[0]
      return row ? mapUser(row) : null
    },

    async findUserById(id: string): Promise<User | null> {
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
      const row = rows[0]
      return row ? mapUser(row) : null
    },

    async createUser(data: CreateUserInput): Promise<User> {
      const values: Record<string, unknown> = {
        email: data.email,
        passwordHash: data.passwordHash,
      }
      if (data.role !== undefined) values['role'] = data.role
      const inserted = await db.insert(users).values(values).returning()
      return mapUser(inserted[0])
    },

    async updateUser(id: string, data: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
      const patch: Record<string, unknown> = {}
      if (data.email !== undefined) patch['email'] = data.email
      if (data.passwordHash !== undefined) patch['passwordHash'] = data.passwordHash
      if (data.emailVerified !== undefined) patch['emailVerified'] = data.emailVerified
      if (data.role !== undefined) patch['role'] = data.role
      if (data.twoFactorEnabled !== undefined) patch['twoFactorEnabled'] = data.twoFactorEnabled
      if (data.twoFactorSecret !== undefined) patch['twoFactorSecret'] = data.twoFactorSecret
      // SQLite `$onUpdate` populates updatedAt automatically; PG schema does too.
      // We don't set it manually so the schema's onUpdate hook fires.
      const updated = await db.update(users).set(patch).where(eq(users.id, id)).returning()
      return mapUser(updated[0])
    },

    async createToken(data: CreateTokenInput): Promise<Token> {
      const inserted = await db
        .insert(tokens)
        .values({
          userId: data.userId,
          type: data.type,
          token: data.token, // already hashed by caller
          expiresAt: data.expiresAt,
        })
        .returning()
      return mapToken(inserted[0])
    },

    async findToken(rawToken: string, type: TokenType): Promise<Token | null> {
      const hashed = hashRawToken(rawToken)
      const rows = await db
        .select()
        .from(tokens)
        .where(and(eq(tokens.token, hashed), eq(tokens.type, type)))
        .limit(1)
      const row = rows[0]
      return row ? mapToken(row) : null
    },

    async deleteToken(id: string): Promise<void> {
      await db.delete(tokens).where(eq(tokens.id, id))
    },

    async deleteExpiredTokens(): Promise<void> {
      await db.delete(tokens).where(lt(tokens.expiresAt, new Date()))
    },

    async deleteTokensByUserAndType(userId: string, type: TokenType): Promise<void> {
      await db.delete(tokens).where(and(eq(tokens.userId, userId), eq(tokens.type, type)))
    },

    async findOAuthAccount(
      provider: string,
      providerAccountId: string,
    ): Promise<OAuthAccount | null> {
      const rows = await db
        .select()
        .from(oauthAccounts)
        .where(
          and(
            eq(oauthAccounts.provider, provider),
            eq(oauthAccounts.providerAccountId, providerAccountId),
          ),
        )
        .limit(1)
      const row = rows[0]
      return row ? mapOAuthAccount(row) : null
    },

    async createOAuthAccount(data: CreateOAuthAccountInput): Promise<OAuthAccount> {
      const values: Record<string, unknown> = {
        userId: data.userId,
        provider: data.provider,
        providerAccountId: data.providerAccountId,
        accessToken: data.accessToken,
      }
      if (data.refreshToken !== undefined) values['refreshToken'] = data.refreshToken
      if (data.expiresAt !== undefined) values['expiresAt'] = data.expiresAt
      const inserted = await db.insert(oauthAccounts).values(values).returning()
      return mapOAuthAccount(inserted[0])
    },

    async updateOAuthAccount(
      id: string,
      data: Partial<Pick<OAuthAccount, 'accessToken' | 'refreshToken' | 'expiresAt'>>,
    ): Promise<OAuthAccount> {
      const patch: Record<string, unknown> = {}
      if (data.accessToken !== undefined) patch['accessToken'] = data.accessToken
      if (data.refreshToken !== undefined) patch['refreshToken'] = data.refreshToken
      if (data.expiresAt !== undefined) patch['expiresAt'] = data.expiresAt
      const updated = await db
        .update(oauthAccounts)
        .set(patch)
        .where(eq(oauthAccounts.id, id))
        .returning()
      return mapOAuthAccount(updated[0])
    },
  }
}
