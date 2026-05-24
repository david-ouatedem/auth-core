# @authcore/drizzle-adapter

Drizzle ORM database adapter for AuthCore. Postgres + SQLite.

## Install

```bash
# Postgres
pnpm add @authcore/drizzle-adapter @authcore/core drizzle-orm pg

# SQLite
pnpm add @authcore/drizzle-adapter @authcore/core drizzle-orm better-sqlite3
```

## Postgres

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { drizzleAdapter, users, tokens, oauthAccounts } from '@authcore/drizzle-adapter/pg'
import { createAuth } from '@authcore/core'

const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }))

const auth = createAuth({
  db: drizzleAdapter(db),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})
```

Re-export `users`, `tokens`, `oauthAccounts`, `tokenTypeEnum` from your own schema file so `drizzle-kit generate` picks them up.

## SQLite

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { drizzleAdapter } from '@authcore/drizzle-adapter/sqlite'

const sqlite = new Database('./auth.db')
sqlite.pragma('foreign_keys = ON')
const db = drizzle(sqlite)

const auth = createAuth({ db: drizzleAdapter(db), session: { ... } })
```

## Subpath exports

| Import | Use for |
|---|---|
| `@authcore/drizzle-adapter/pg` | Postgres schema + adapter |
| `@authcore/drizzle-adapter/sqlite` | SQLite schema + adapter |
| `@authcore/drizzle-adapter` | `createDrizzleAdapter` only (for advanced users supplying their own schema) |

## Documentation

See [the Drizzle adapter guide](https://david-ouatedem.github.io/auth-core/adapters/drizzle.html) for schema extension, migration tips, and a side-by-side with the Prisma adapter.

## License

MIT
