# AuthCore — Next.js example

End-to-end demo of `@authcore/nextjs` showing every flagship feature in one app.

## What's wired up

| Feature | Where to try it |
|---|---|
| Email / password sign-up + sign-in | `/signup`, `/login` |
| Magic-link sign-in (passwordless) | `/magic-link` |
| Sign in with Google (OAuth 2.0 + PKCE) | Login page when `GOOGLE_CLIENT_ID` is set |
| TOTP 2FA enrollment + login challenge | `/settings` → set up; next login shows the challenge |
| Refresh tokens with rotation | Automatic. Client refreshes when the JWT expires. |
| CSRF synchronizer-token protection | On (`session.csrf: true`) in `lib/auth.ts` |
| Server Components reading the user | `app/dashboard/page.tsx` via `getCurrentUser` |
| Route protection via middleware | `middleware.ts` — redirects unauthed requests to `/login?next=…` |

All driven by **one** catch-all route handler in `app/api/auth/[...authcore]/route.ts`.

## Run it

```bash
# From the repo root (so workspace packages resolve):
pnpm install
pnpm -w run build

# Then in this directory:
cd examples/nextjs
cp .env.example .env.local
# Open .env.local and set AUTH_SECRET to a strong random string (>= 32 chars)

pnpm db:init          # creates ./auth.db (SQLite) with the AuthCore tables
pnpm dev              # http://localhost:3000
```

That's the minimum — you can:
- Sign up, sign in, sign out
- Try magic-link sign-in (the link prints to your `pnpm dev` terminal; click it)
- Enable 2FA from `/settings`, then sign out and back in to see the challenge

## Optional: enable Google OAuth

1. Create an OAuth Client ID at <https://console.cloud.google.com/apis/credentials>:
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/api/auth/oauth/google/callback`
2. Set in `.env.local`:
   ```
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…
   ```
3. Restart `pnpm dev`. The "Sign in with Google" button appears on `/login`.

## Optional: real email delivery (Resend)

By default this example uses a **console email adapter** that prints emails to the dev server log — perfect for trying magic-link flows without configuring an email provider.

To switch to Resend:

1. Sign up at <https://resend.com>, get an API key.
2. Set in `.env.local`:
   ```
   RESEND_API_KEY=re_…
   RESEND_FROM=auth@yourverified.domain
   ```
3. Wire it in `lib/auth.ts` — swap `consoleEmail` for `resendAdapter(process.env.RESEND_API_KEY!)` (see [docs/adapters/resend](../../docs/adapters/resend.md)).

## Architecture

```
app/
├── api/auth/[...authcore]/route.ts   ← single file = all auth routes
├── dashboard/page.tsx                ← Server Component using getCurrentUser
├── login/                            ← password + 2FA challenge UI
├── magic-link/page.tsx               ← email-me-a-link flow
├── settings/                         ← 2FA enrollment / disable
├── signup/page.tsx
├── page.tsx                          ← landing
├── layout.tsx
└── providers.tsx                     ← <AuthProvider> Client Component wrapper

lib/auth.ts                           ← AuthCore wiring (single source of truth)
db/                                   ← Drizzle SQLite schema + connection
middleware.ts                         ← edge-safe cookie-presence check
```

## Swapping out the DB

This example uses **SQLite via Drizzle** for zero-friction setup. To switch to Postgres:

1. `pnpm add pg @types/pg`
2. In `db/index.ts`, swap the SQLite driver for `drizzle-orm/node-postgres`:
   ```ts
   import { drizzle } from 'drizzle-orm/node-postgres'
   import { Pool } from 'pg'
   export const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }))
   ```
3. In `db/schema.ts`, swap the import:
   ```ts
   export { users, tokens, oauthAccounts, tokenTypeEnum } from '@authcore/drizzle-adapter/pg'
   ```
4. In `lib/auth.ts`, swap `@authcore/drizzle-adapter/sqlite` → `@authcore/drizzle-adapter/pg`.

Same surface, different backing store.
