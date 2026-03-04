# AuthCore — Frontend-Only Example

A standalone React SPA that connects to any AuthCore-compatible API.
No backend code — just configure the API URL and go.

## Prerequisites

- Node.js 18+
- pnpm
- A running AuthCore API (e.g. the `api-only/backend` example)

## Setup

```bash
cp .env.example .env
# Edit .env — set VITE_API_URL to your AuthCore API

pnpm install
pnpm dev
```

App runs on http://localhost:5173.

## Configuration

Set `VITE_API_URL` in `.env` to point to your AuthCore backend:

```
VITE_API_URL=http://localhost:3000
```

The app expects the API to have CORS enabled for `http://localhost:5173`.

## Auth Flow

1. Register or sign in
2. Token is stored in localStorage
3. Protected requests include the token as a Bearer header
4. Sign out clears the token
