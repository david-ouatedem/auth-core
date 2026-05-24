/**
 * `@authcore/drizzle-adapter` — Drizzle ORM database adapter for AuthCore.
 *
 * **Import from a dialect-specific subpath**, not from this file:
 *
 *   - `@authcore/drizzle-adapter/pg` — Postgres (node-postgres / postgres.js)
 *   - `@authcore/drizzle-adapter/sqlite` — SQLite (better-sqlite3 / libsql)
 *
 * The dialects differ in column types and DB driver, so you pick one. Routing
 * everyone through dialect-specific entries means we never accidentally serve
 * PG column types to a SQLite app or vice versa.
 *
 * Only `createDrizzleAdapter` (the dialect-agnostic factory) is exported from
 * the root — and only for advanced users who supply their own schema. Most
 * apps want `drizzleAdapter` from the matching subpath.
 */
export { createDrizzleAdapter } from './createAdapter.js'
