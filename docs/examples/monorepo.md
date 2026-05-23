# Monorepo Example

Express backend + React frontend in a single project, using cookie-based auth.

[View source on GitHub](https://github.com/david-ouatedem/auth-core/tree/main/examples/monorepo)

## Architecture

```
examples/monorepo/
├── server/    Express + Prisma + @authcore/express with useCookies (port 3000)
└── client/    Vite + React + @authcore/react mode="cookie" (port 5173)
```

- Vite dev server proxies `/auth` and `/api` to backend
- In production, Express serves the built client SPA
- Auth uses httpOnly cookies — no token in localStorage

## Setup

```bash
cd examples/monorepo
cp .env.example .env

cd server && pnpm install && pnpm db:push && cd ..
cd client && pnpm install && cd ..
```

Run in two terminals:

```bash
pnpm dev:server    # Express on :3000
pnpm dev:client    # Vite on :5173 with proxy
```

## Key Code

**Server** — cookie-based auth:

```ts
app.use('/auth', auth.router({ useCookies: true }))
```

The template uses the default `authcore_token` cookie name. To customize, put it on `session.cookieName` so both `auth.router()` and `auth.middleware()` agree:

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET!, cookieName: 'my_token' },
})
```

**Client** — cookie mode (no token management needed):

```tsx
<AuthProvider baseUrl="/auth" mode="cookie">
  <AppContent />
</AuthProvider>
```

**Vite proxy** — routes auth requests to backend during dev:

```ts
server: {
  proxy: {
    '/auth': 'http://localhost:3000',
    '/api': 'http://localhost:3000',
  },
}
```
