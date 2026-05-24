/**
 * Re-export the bundled AuthCore tables. drizzle-kit picks them up here.
 * Add your own app tables alongside (orders, posts, whatever) and they live
 * in the same SQLite file.
 */
export { users, tokens, oauthAccounts } from '@authcore/drizzle-adapter/sqlite'
