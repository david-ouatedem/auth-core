# AuthCore — Monorepo Example

Express backend + React frontend in a single project, using cookie-based auth.

## Prerequisites

- Node.js 18+
- PostgreSQL (or Docker)

## Setup

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and AUTH_SECRET

cd server && pnpm install && npx prisma db push && cd ..
cd client && pnpm install && cd ..
```

## Development

Run in two terminals:

```bash
# Terminal 1 — backend
pnpm dev:server

# Terminal 2 — frontend (proxies /auth and /api to backend)
pnpm dev:client
```

Frontend runs on http://localhost:5173 and proxies auth routes to http://localhost:3000.

## Auth Flow

1. Register a new account
2. Sign in — server sets an httpOnly cookie (default name: `authcore_token`)
3. Access protected routes — cookie is sent automatically
4. Sign out — cookie is cleared

## Customizing the cookie name

If you want a different cookie name, put it on `session.cookieName`:

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET!, cookieName: 'my_token' },
})
```

Both `auth.router({ useCookies: true })` and `auth.middleware()` read it from there.
