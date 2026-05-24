# Drizzle ORM Adapter

`@authcore/drizzle-adapter` is an alternative to `@authcore/prisma-adapter`. Pick it when you already use Drizzle in the project, when you want lighter migrations (just SQL), or when you want SQLite for dev / Postgres for prod from the same codebase.

## Install

Pick the dialect you're using:

```bash
# Postgres
pnpm add @authcore/drizzle-adapter @authcore/core drizzle-orm pg
pnpm add -D drizzle-kit

# SQLite (better-sqlite3)
pnpm add @authcore/drizzle-adapter @authcore/core drizzle-orm better-sqlite3
pnpm add -D drizzle-kit @types/better-sqlite3
```

Drizzle 0.30–0.36 are tested. `drizzle-orm` is a peer dependency, so you control the version.

## Postgres

```ts
// db/schema.ts — re-export the AuthCore tables so drizzle-kit picks them up
export {
  users,
  tokens,
  oauthAccounts,
  tokenTypeEnum,
} from '@authcore/drizzle-adapter/pg'
```

```ts
// db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
```

```ts
// lib/auth.ts
import { createAuth } from '@authcore/core'
import { drizzleAdapter } from '@authcore/drizzle-adapter/pg'
import { db } from '../db'

export const auth = createAuth({
  db: drizzleAdapter(db),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})
```

Generate + apply the migration:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

## SQLite

```ts
// db/schema.ts
export {
  users,
  tokens,
  oauthAccounts,
} from '@authcore/drizzle-adapter/sqlite'
```

```ts
// db/index.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const sqlite = new Database('./auth.db')
sqlite.pragma('foreign_keys = ON')   // required for cascade deletes
sqlite.pragma('journal_mode = WAL')  // recommended for concurrent reads
export const db = drizzle(sqlite, { schema })
```

```ts
// lib/auth.ts
import { drizzleAdapter } from '@authcore/drizzle-adapter/sqlite'

export const auth = createAuth({
  db: drizzleAdapter(db),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})
```

**SQLite quirks to know:**

- **IDs are random UUID strings** (`text`), not native UUIDs. Drizzle's `$defaultFn` generates them with `crypto.randomUUID()` at insert time — fully compatible with the AuthCore TS type (also `string`).
- **Timestamps are stored as `INTEGER` (Unix ms).** Drizzle's `{ mode: 'timestamp_ms' }` converts JS `Date` to/from the integer transparently.
- **Booleans are `INTEGER 0|1`.** Drizzle's `{ mode: 'boolean' }` handles the round-trip.
- **The token-type column is `text`** (no native enum). AuthCore's TS types still enforce the union at the call site, so this isn't a real safety regression.

## Extending the schema

The exported tables are plain Drizzle objects. To add extra columns, **redefine the table** in your schema file with the AuthCore fields plus your own:

```ts
// db/schema.ts
import { pgTable, text, boolean, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  // AuthCore-required fields:
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

  // Your own fields:
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
})

// Re-use AuthCore's other tables as-is:
export { tokens, oauthAccounts, tokenTypeEnum } from '@authcore/drizzle-adapter/pg'
```

Then pass the bundle to the adapter explicitly:

```ts
import { drizzleAdapter } from '@authcore/drizzle-adapter/pg'
import * as schema from './schema'

const auth = createAuth({
  db: drizzleAdapter(db, schema),
  // …
})
```

The adapter reads/writes only the AuthCore fields — your extra columns stay untouched. To read them in your own code, query the table directly via Drizzle.

## Comparison with `@authcore/prisma-adapter`

| | Prisma | Drizzle |
|---|---|---|
| Schema file | `schema.prisma` (DSL) | TypeScript |
| Migrations | `prisma migrate` | `drizzle-kit generate` |
| Dialects | Postgres (AuthCore-tested) | Postgres + SQLite (and MySQL, see below) |
| Query API | Code-generated client | Function-based with `eq`, `and`, `lt` |
| Cold start | Slower (engine load) | Faster |
| Bundle size | Heavier | Lighter |
| Drift from DB | Possible if migrations diverge | Drizzle introspects the live DB |

**You can switch between them.** The `DatabaseAdapter` contract is identical — the same `auth.login`, `auth.register`, etc. work against both. Tests in this repo demonstrate both adapters passing the same suite.

## MySQL support

Not bundled yet, but trivial to add yourself: copy the SQLite schema into your codebase, replace `sqliteTable` with `mysqlTable` from `drizzle-orm/mysql-core`, adjust the column types (use `varbinary` for `id`, `bigint` or `datetime` for timestamps), then call `createDrizzleAdapter(db, yourSchema)` from `@authcore/drizzle-adapter`. The generic adapter is dialect-agnostic; the schemas are dialect-specific. PR welcome if you want it upstreamed.

## Why a separate adapter package and not a generic SQL one

We could ship a single `@authcore/sql-adapter` that takes raw SQL queries. We don't, because Drizzle gives the user typed queries, generated migrations, schema introspection, and a unified API for extending the schema with their own columns. Going through Drizzle is the path most users want; the adapter just wires AuthCore's `DatabaseAdapter` contract to Drizzle's tables.
