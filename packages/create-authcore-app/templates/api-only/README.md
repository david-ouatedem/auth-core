# AuthCore — API-Only Example

Express API backend + React SPA frontend, communicating via JWT Bearer tokens.

## Prerequisites

- Node.js 18+
- PostgreSQL (or Docker)

## Setup

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and AUTH_SECRET

pnpm install
npx prisma db push
pnpm dev
```

### Frontend

```bash
cd frontend
cp .env.example .env
pnpm install
pnpm dev
```

Backend runs on http://localhost:3000, frontend on http://localhost:5173.

## Auth Flow

1. Register a new account
2. Sign in — server returns a JWT
3. Token stored in localStorage
4. API requests include `Authorization: Bearer <token>` header
5. Sign out clears the token
