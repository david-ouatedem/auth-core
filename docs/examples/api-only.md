# API-Only Example

Separate Express API backend + React SPA frontend communicating via Bearer token auth.

[View source on GitHub](https://github.com/david-ouatedem/auth-core/tree/main/examples/api-only)

## Architecture

```
examples/api-only/
├── backend/    Express + Prisma + @authcore/express (port 3000)
└── frontend/   Vite + React + @authcore/react mode="api" (port 5173)
```

- Frontend stores JWT in localStorage
- API requests include `Authorization: Bearer <token>` header
- CORS enabled on backend for `http://localhost:5173`

## Setup

### Backend

```bash
cd examples/api-only/backend
cp .env.example .env
pnpm install
pnpm db:push
pnpm dev
```

### Frontend

```bash
cd examples/api-only/frontend
cp .env.example .env
pnpm install
pnpm dev
```

## Key Code

**Backend** — [backend/src/index.ts](https://github.com/david-ouatedem/auth-core/blob/main/examples/api-only/backend/src/index.ts)

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})

app.use('/auth', auth.router())
app.get('/api/me', auth.middleware(), (req, res) => {
  res.json({ user: req.user })
})
```

**Frontend** — [frontend/src/App.tsx](https://github.com/david-ouatedem/auth-core/blob/main/examples/api-only/frontend/src/App.tsx)

```tsx
<AuthProvider baseUrl={`${API_URL}/auth`} mode="api">
  <AppContent />
</AuthProvider>
```
