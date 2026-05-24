import type { DatabaseAdapter } from '@authcore/types'
import { createDrizzleAdapter } from '../createAdapter.js'
import { authcoreSchema as defaultSchema } from './schema.js'

export { users, tokens, oauthAccounts, authcoreSchema } from './schema.js'
export type { AuthcoreSchema } from './schema.js'

/**
 * Create a {@link DatabaseAdapter} for AuthCore backed by Drizzle on SQLite.
 *
 * ```ts
 * import Database from 'better-sqlite3'
 * import { drizzle } from 'drizzle-orm/better-sqlite3'
 * import { drizzleAdapter } from '@authcore/drizzle-adapter/sqlite'
 *
 * const sqlite = new Database('./auth.db')
 * const db = drizzle(sqlite)
 *
 * const auth = createAuth({
 *   db: drizzleAdapter(db),
 *   session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
 * })
 * ```
 *
 * Pass `schema` only if you've extended the bundled tables. Note that the
 * SQLite schema stores timestamps as `INTEGER` (Unix ms) and booleans as
 * `INTEGER 0|1` — Drizzle's column modes handle the JS <-> DB conversion.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drizzleAdapter(db: any, schema = defaultSchema): DatabaseAdapter {
  return createDrizzleAdapter(db, schema)
}
