import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

// Lazy singleton — important so the SQLite native binding loads at request
// time (Node runtime), NOT at module import (which would also fire during
// `next build`'s page-data collection and break the build on machines whose
// better-sqlite3 prebuilt binary doesn't match their Node ABI).
let _db: BetterSQLite3Database<typeof schema> | undefined

function getDb(): BetterSQLite3Database<typeof schema> {
  if (_db) return _db
  // Dynamic-require so the native module is only resolved when actually called.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3') as new (path: string) => {
    pragma(s: string): void
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { drizzle } = require('drizzle-orm/better-sqlite3') as {
    drizzle: (
      db: unknown,
      opts: { schema: typeof schema },
    ) => BetterSQLite3Database<typeof schema>
  }
  const sqlite = new Database(process.env['DATABASE_FILE'] ?? './auth.db')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('journal_mode = WAL')
  _db = drizzle(sqlite, { schema })
  return _db
}

/**
 * Proxy that resolves to the underlying Drizzle DB on every property access.
 * Lets us keep `db.select()` / `db.insert()` ergonomics across the codebase
 * while staying lazy.
 */
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})
