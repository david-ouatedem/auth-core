import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

/**
 * Drizzle SQLite schema for AuthCore.
 *
 * Mirrors {@link "@authcore/drizzle-adapter/pg"} field-for-field with three
 * SQLite-flavored differences:
 *
 * 1. **IDs** are `text` (no native UUID type) defaulted by Node's
 *    `crypto.randomUUID()` at insert time.
 * 2. **Timestamps** are stored as `integer({ mode: 'timestamp_ms' })` —
 *    JS `Date` round-trips transparently; the DB sees Unix ms.
 * 3. **`type`** is a `text` column (SQLite has no native enums). Values are
 *    constrained at the TypeScript layer; the adapter never writes anything
 *    outside the AuthCore TokenType union.
 *
 * Drop the exports into your Drizzle schema file:
 *
 * ```ts
 * // db/schema.ts
 * export { users, tokens, oauthAccounts } from '@authcore/drizzle-adapter/sqlite'
 * ```
 */

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID())

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())

const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  role: text('role').notNull().default('user'),
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
  twoFactorSecret: text('two_factor_secret'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const tokens = sqliteTable(
  'tokens',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** SHA-256 hash of the raw token. Never the raw value. */
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    typeExpiresIdx: index('tokens_type_expires_idx').on(table.type, table.expiresAt),
    userIdIdx: index('tokens_user_id_idx').on(table.userId),
  }),
)

export const oauthAccounts = sqliteTable(
  'oauth_accounts',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Provider id, e.g. 'google', 'github'. */
    provider: text('provider').notNull(),
    /** User's identifier at the provider (Google's `sub`, GitHub's numeric id, etc.). */
    providerAccountId: text('provider_account_id').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    providerAccountIdx: uniqueIndex('oauth_accounts_provider_account_idx').on(
      table.provider,
      table.providerAccountId,
    ),
    userIdIdx: index('oauth_accounts_user_id_idx').on(table.userId),
  }),
)

/** Bundle of all AuthCore schema objects — pass to `drizzleAdapter`. */
export const authcoreSchema = {
  users,
  tokens,
  oauthAccounts,
} as const

export type AuthcoreSchema = typeof authcoreSchema
