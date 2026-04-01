# AuthCore — Frontend-Only Example

A standalone React SPA that connects to **any auth API** — AuthCore-powered or custom.
No backend code — just configure the API URL and response transformers, and go.

## Prerequisites

- Node.js 18+
- pnpm
- A running auth API (AuthCore or your own)

## Setup

```bash
cp .env.example .env
# Edit .env — set VITE_API_URL to your API base URL

pnpm install
pnpm dev
```

App runs on http://localhost:5173.

## Configuration

Set `VITE_API_URL` in `.env`:

```
VITE_API_URL=http://localhost:3000
```

The app expects the API to have CORS enabled for `http://localhost:5173`.

## Using with an AuthCore backend

Works out of the box — the default route paths and response shapes match AuthCore's Express/Fastify adapters.

```tsx
<AuthProvider baseUrl={`${API_URL}/auth`} mode="api">
```

## Using with a custom backend

If your backend returns a different JSON shape, use the transformer props.
See `src/App.tsx` for a commented example.

```tsx
// Backend returns { data: { user }, access_token: "..." }
<AuthProvider
  baseUrl={API_URL}
  transformAuthResponse={(raw) => {
    const r = raw as { data: { user: MyUser }; access_token: string }
    return { user: r.data.user, token: r.access_token }
  }}
  transformUser={(raw) => (raw as { data: MyUser }).data}
  transformError={(body) => (body as { message: string }).message ?? 'Unknown error'}
  routes={{ login: '/auth/sign-in', me: '/auth/me', logout: '/auth/sign-out', register: '/auth/sign-up' }}
>
```

## Auth Flow

1. Register or sign in
2. Token is stored in localStorage (`api` mode)
3. Protected requests include the token as a Bearer header
4. Sign out clears the token
