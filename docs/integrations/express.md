# Express Integration

## Install

```bash
pnpm add @authcore/express
```

## Basic Setup

```ts
import express from 'express'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createAuth } from '@authcore/express'

const prisma = new PrismaClient()
const app = express()
app.use(express.json())

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})

// Mount auth routes at /auth
app.use('/auth', auth.router())

// Protect routes with middleware
app.get('/dashboard', auth.middleware(), (req, res) => {
  res.json({ user: req.user })
})

// Optional auth — req.user may be undefined
app.get('/public', auth.optionalMiddleware(), (req, res) => {
  res.json({ user: req.user ?? null })
})

app.listen(3000)
```

## Cookie Mode

For monorepo setups where frontend and backend share the same origin:

```ts
import cookieParser from 'cookie-parser'

app.use(cookieParser())

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
    cookieName: 'my_token',   // optional; default 'authcore_token'
  },
})

app.use('/auth', auth.router({ useCookies: true }))

// auth.middleware() automatically reads the cookie name from session.cookieName
app.get('/dashboard', auth.middleware(), (req, res) => {
  res.json({ user: req.user })
})
```

Tokens are set as httpOnly cookies instead of returned in the response body. `cookie-parser` is required for the middleware to read incoming cookies — install it alongside `@authcore/express` whenever `useCookies` is enabled.

## API

### `createAuth(config: AuthCoreConfig): ExpressAuth`

Returns an object with:

- **`router(config?)`** — Express Router with all auth routes
- **`middleware()`** — Requires valid auth, attaches `req.user`, returns 401 on failure
- **`optionalMiddleware()`** — Attaches `req.user` if valid token exists, never rejects

### Router Config

```ts
auth.router({
  useCookies: true,
  cookieName: 'authcore_token',  // optional per-router override (deprecated — prefer session.cookieName)
  baseUrl: 'https://app.example.com',  // used to build URLs in reset/verify/invite emails
  routes: {
    register: '/register',       // default
    login: '/login',
    logout: '/logout',
    me: '/me',
    verifyEmail: '/verify-email',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    invite: '/invite',
    acceptInvitation: '/accept-invitation',
    refresh: '/refresh',
    revoke: '/revoke',
  },
})
```

## Refresh Tokens (0.10+)

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
    expiresIn: '15m',          // short-lived JWT
    refreshExpiresIn: '30d',   // long-lived refresh
  },
})
app.use('/auth', auth.router())

// POST /auth/refresh — { refreshToken } in body (api mode) OR cookie (cookie mode)
// Returns: { user, token, refreshToken }  — rotated. Old refresh token now invalid.

// POST /auth/revoke — { refreshToken } — idempotent.
// POST /auth/logout — also revokes the refresh token server-side.
```

See [Refresh Tokens](/security/refresh-tokens).

## CSRF Protection (0.10+, cookie mode)

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET!, csrf: true },
})
app.use('/auth', auth.router({ useCookies: true }))
```

Login sets a non-httpOnly `authcore_token_csrf` cookie. State-changing requests must echo it back as `X-CSRF-Token`. `@authcore/react` does this automatically.

See [CSRF](/security/csrf).
