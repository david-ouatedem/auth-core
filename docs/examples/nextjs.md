# Next.js example

End-to-end demo of `@authcore/nextjs` showing every flagship feature in one app: email/password sign-up, login, magic-link, Google OAuth (optional), TOTP 2FA, refresh tokens, CSRF, server-component user reads, and middleware route protection.

**Source:** [`examples/nextjs`](https://github.com/david-ouatedem/auth-core/tree/main/examples/nextjs) in the repo.

## Run it

```bash
# from the repo root, so workspace packages resolve:
pnpm install
pnpm -w run build

# then:
cd examples/nextjs
cp .env.example .env.local
# edit .env.local and set AUTH_SECRET to a strong random string (≥ 32 chars)

pnpm db:init       # creates auth.db (SQLite) with the AuthCore tables
pnpm dev           # http://localhost:3000
```

You can immediately:

- **Sign up** with email + password at `/signup`
- **Sign in** at `/login`
- **Request a magic link** at `/magic-link` — the link prints to your `pnpm dev` terminal (no email provider needed for local testing)
- **Enable 2FA** at `/settings`, scan the QR with any authenticator app, then sign out and back in to see the challenge flow

## Optional: Google OAuth

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`. The "Sign in with Google" button appears on `/login`. Configure the **Authorized redirect URI** in Google Cloud Console as `http://localhost:3000/api/auth/oauth/google/callback`.

## What's in each file

```
app/
├── api/auth/[...authcore]/route.ts   ← single file = every auth endpoint
├── page.tsx                          ← landing
├── signup/page.tsx                   ← email + password registration
├── login/                            ← password + OAuth + 2FA challenge UI
│   ├── page.tsx
│   └── LoginForm.tsx
├── magic-link/page.tsx               ← passwordless email link request
├── dashboard/                        ← protected; reads user via getCurrentUser
│   ├── page.tsx
│   └── LogoutButton.tsx
├── settings/                         ← 2FA enrollment + disable
│   ├── page.tsx
│   └── TwoFactorSection.tsx
├── layout.tsx                        ← wraps app in <AuthProvider>
└── providers.tsx                     ← 'use client' boundary

lib/auth.ts                           ← AuthCore wiring (single source of truth)
db/                                   ← Drizzle SQLite schema + connection
middleware.ts                         ← edge-safe cookie presence check
```

## Architecture highlights

**One catch-all route.** `app/api/auth/[...authcore]/route.ts` re-exports `GET` and `POST` from `lib/auth.ts`. Every AuthCore endpoint — `/register`, `/login`, `/refresh`, `/2fa/verify`, `/oauth/google`, etc. — is served from this single file.

**Server Components read the user with `getCurrentUser`.** No client-side hydration round-trip: the dashboard page is rendered with the user already in hand:

```tsx
const user = await getCurrentUser()
if (!user) redirect('/login?next=/dashboard')
```

**Middleware is edge-safe.** It checks for cookie presence only — no JWT verification at the edge. Real verification happens in Server Components / Route Handlers (where the Node runtime can use `jsonwebtoken`).

**Lazy DB initialization.** `db/index.ts` returns a Proxy that resolves to the real Drizzle DB on first property access — avoids loading the SQLite native module during `next build`'s page-data collection phase.

**Cookie mode + CSRF.** `useCookies: true` keeps the JWT in an `HttpOnly` cookie; `csrf: true` adds a synchronizer-token cookie that `@authcore/core-web` automatically echoes back on every state-changing request.

## Swapping to Postgres

This example uses SQLite for zero-friction setup. To switch:

1. `pnpm add pg @types/pg`
2. In `db/index.ts`, swap the driver:
   ```ts
   const { drizzle } = require('drizzle-orm/node-postgres')
   const { Pool } = require('pg')
   _db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }))
   ```
3. In `db/schema.ts`, swap the schema import:
   ```ts
   export { users, tokens, oauthAccounts, tokenTypeEnum } from '@authcore/drizzle-adapter/pg'
   ```
4. In `lib/auth.ts`, swap `@authcore/drizzle-adapter/sqlite` → `@authcore/drizzle-adapter/pg`.

Same routes, same UI, different backing store.

## See also

- [Configuration reference](/configuration)
- [Next.js integration guide](/integrations/nextjs)
- [Drizzle adapter guide](/adapters/drizzle)
- [OAuth setup](/security/oauth) · [Magic-link](/security/magic-link) · [Two-factor](/security/two-factor)
