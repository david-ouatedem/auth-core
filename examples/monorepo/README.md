# AuthCore — Monorepo Example

Express backend + React frontend in a single project, using cookie-based auth.
In production the server serves the built client SPA.

## Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL (or use Docker: `docker compose up -d` from repo root)

## Setup

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL and AUTH_SECRET

cd server && pnpm install && pnpm db:push && cd ..
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

## Production

```bash
cd client && pnpm build && cd ..
NODE_ENV=production pnpm dev:server
```

Server serves the built client and handles auth via cookies.

## Auth Flow

1. Register a new account
2. Sign in — server sets an httpOnly cookie
3. Access protected routes — cookie is sent automatically
4. Sign out — cookie is cleared
