import type { DatabaseAdapter } from '@authcore/types'
import { createDrizzleAdapter } from '../createAdapter.js'
import { authcoreSchema as defaultSchema } from './schema.js'

export {
  users,
  tokens,
  oauthAccounts,
  tokenTypeEnum,
  authcoreSchema,
} from './schema.js'
export type { AuthcoreSchema } from './schema.js'

/**
 * Create a {@link DatabaseAdapter} for AuthCore backed by Drizzle on Postgres.
 *
 * ```ts
 * import { drizzle } from 'drizzle-orm/node-postgres'
 * import { Pool } from 'pg'
 * import { drizzleAdapter } from '@authcore/drizzle-adapter/pg'
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL })
 * const db = drizzle(pool)
 *
 * const auth = createAuth({
 *   db: drizzleAdapter(db),
 *   session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
 * })
 * ```
 *
 * Pass `schema` only if you've extended the default schema with extra columns
 * or rebuilt the tables with different names — the adapter then reads/writes
 * against your version. Otherwise the bundled `authcore_*` tables are used.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drizzleAdapter(db: any, schema = defaultSchema): DatabaseAdapter {
  return createDrizzleAdapter(db, schema)
}
