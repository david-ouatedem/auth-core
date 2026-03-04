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
await app.register(auth.plugin({ useCookies: true }), { prefix: '/auth' })
```

Tokens are set as httpOnly cookies via `reply.setCookie()`.

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
