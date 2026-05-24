// One-shot script: creates the SQLite tables if the DB is fresh.
// Real apps should use drizzle-kit; this is the demo's zero-friction path.
import Database from 'better-sqlite3'

const sqlite = new Database(process.env.DATABASE_FILE ?? './auth.db')
sqlite.pragma('foreign_keys = ON')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY NOT NULL,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    email_verified integer NOT NULL DEFAULT 0,
    role text NOT NULL DEFAULT 'user',
    two_factor_enabled integer NOT NULL DEFAULT 0,
    two_factor_secret text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tokens (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    token text NOT NULL UNIQUE,
    expires_at integer NOT NULL,
    created_at integer NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tokens_type_expires_idx ON tokens(type, expires_at);
  CREATE INDEX IF NOT EXISTS tokens_user_id_idx ON tokens(user_id);
  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    expires_at integer,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS oauth_accounts_provider_account_idx
    ON oauth_accounts(provider, provider_account_id);
  CREATE INDEX IF NOT EXISTS oauth_accounts_user_id_idx ON oauth_accounts(user_id);
`)

console.log('Database initialized at', sqlite.name)
sqlite.close()
