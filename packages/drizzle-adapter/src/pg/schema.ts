import {
  pgTable,
  pgEnum,
  text,
  boolean,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * Drizzle PostgreSQL schema for AuthCore.
 *
 * Mirrors the shape of `@authcore/prisma-adapter`'s schema:
 * - `users`, `tokens`, `oauth_accounts` tables.
 * - Same nullability + uniqueness constraints.
 * - Same indexes (token by type+expiresAt, oauth_account by provider+providerAccountId).
 *
 * Drop the exports into your Drizzle schema file:
 *
 * ```ts
 * // db/schema.ts
 * export { users, tokens, oauthAccounts, tokenTypeEnum } from '@authcore/drizzle-adapter/pg'
 * ```
 *
 * Then generate a migration with `drizzle-kit`:
 *
 * ```bash
 * pnpm drizzle-kit generate
 * pnpm drizzle-kit migrate
 * ```
 *
 * The tables live alongside any app-specific tables you define in the same
 * schema file — drizzle-kit picks them all up.
 */

export const tokenTypeEnum = pgEnum('authcore_token_type', [
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'SESSION',
  'INVITATION',
  'REFRESH',
  'MAGIC_LINK',
  'RECOVERY_CODE',
])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  role: text('role').notNull().default('user'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  twoFactorSecret: text('two_factor_secret'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date()),
})

export const tokens = pgTable(
  'tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: tokenTypeEnum('type').notNull(),
    /** SHA-256 hash of the raw token. Never the raw value. */
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    typeExpiresIdx: index('tokens_type_expires_idx').on(table.type, table.expiresAt),
    userIdIdx: index('tokens_user_id_idx').on(table.userId),
  }),
)

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Provider id, e.g. 'google', 'github'. */
    provider: text('provider').notNull(),
    /** User's identifier at the provider (Google's `sub`, GitHub's numeric id, etc.). */
    providerAccountId: text('provider_account_id').notNull(),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
      .$onUpdate(() => new Date()),
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
  tokenTypeEnum,
} as const

export type AuthcoreSchema = typeof authcoreSchema
