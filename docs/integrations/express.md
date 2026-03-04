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

app.use('/auth', auth.router({ useCookies: true }))
```

Tokens are set as httpOnly cookies instead of returned in the response body.

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
  cookieName: 'authcore_token',  // default
  routes: {
    register: '/register',       // default
    login: '/login',
    logout: '/logout',
    me: '/me',
    verifyEmail: '/verify-email',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
  },
})
```
