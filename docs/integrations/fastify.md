# Fastify Integration

## Install

```bash
pnpm add @authcore/fastify @fastify/cookie
```

## Basic Setup

```ts
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { createAuth } from '@authcore/fastify'

const prisma = new PrismaClient()
const app = Fastify()

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})

await app.register(cookie)
await app.register(auth.plugin(), { prefix: '/auth' })

// Protect routes with preHandler hook
app.get('/dashboard', {
  preHandler: [auth.authRequired()],
}, async (request) => {
  return { user: request.user }
})

// Optional auth
app.get('/public', {
  preHandler: [auth.authOptional()],
}, async (request) => {
  return { user: request.user ?? null }
})

await app.listen({ port: 3000 })
```

## Cookie Mode

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
    cookieName: 'my_token',   // optional; default 'authcore_token'
  },
})

await app.register(cookie)
await app.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })

// auth.authRequired() automatically reads the cookie name from session.cookieName
app.get('/dashboard', { preHandler: [auth.authRequired()] }, async (req) => ({ user: req.user }))
```

Tokens are set as httpOnly cookies via `reply.setCookie()`. `cookieName` is read from `session.cookieName` (the single source of truth) by both the plugin and the hooks.

## API

### `createAuth(config: AuthCoreConfig): FastifyAuth`

Returns an object with:

- **`plugin(config?)`** — Fastify plugin function that registers all auth routes
- **`authRequired()`** — preHandler hook that requires valid auth, attaches `request.user`
- **`authOptional()`** — preHandler hook that optionally attaches `request.user`

### Plugin Config

```ts
auth.plugin({
  useCookies: true,
  cookieName: 'authcore_token',  // optional per-plugin override (deprecated — prefer session.cookieName)
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

Same shape as Express. `POST /auth/refresh` rotates the refresh token; `POST /auth/revoke` invalidates it. `POST /auth/logout` revokes server-side and clears cookies. Configure via `session.refreshExpiresIn` (default `'30d'`).

See [Refresh Tokens](/security/refresh-tokens).

## CSRF (0.10+, cookie mode)

```ts
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET!, csrf: true },
})
await app.register(cookie)
await app.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })
```

State-changing requests must include the `X-CSRF-Token` header matching the `authcore_token_csrf` cookie. See [CSRF](/security/csrf).
