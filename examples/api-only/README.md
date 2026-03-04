# AuthCore — API-Only Example

Separate Express API backend + React SPA frontend communicating via token-based auth.

## Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL (or use Docker: `docker compose up -d` from repo root)

## Setup

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and AUTH_SECRET
pnpm install
pnpm db:push
pnpm dev
```

Backend runs on http://localhost:3000.

### Frontend

```bash
cd frontend
cp .env.example .env
pnpm install
pnpm dev
```

Frontend runs on http://localhost:5173.

## Auth Flow

1. Register a new account
2. Sign in with email/password
3. Access protected `/api/me` endpoint
4. Sign out
