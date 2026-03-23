# @authcore/fastify

> Fastify adapter for AuthCore. Plugin with auth routes and request hooks.

## Install

```bash
npm install @authcore/fastify @authcore/prisma-adapter
```

## Usage

```ts
import Fastify from 'fastify'
import { createAuth } from '@authcore/fastify'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const app = Fastify()
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})

// Register auth plugin, adds all auth routes under /auth
await app.register(auth.plugin(), { prefix: '/auth' })

// Protect routes
app.get('/dashboard', { preHandler: auth.authRequired() }, async (request) => {
  return { user: request.user }
})

// Optional auth
app.get('/public', { preHandler: auth.authOptional() }, async (request) => {
  return { user: request.user ?? null }
})

await app.listen({ port: 3000 })
```

## API

### `createAuth(config)`

Creates a Fastify auth instance. See [`@authcore/core`](https://www.npmjs.com/package/@authcore/core) for the full config reference.

Returns:

- **`auth.plugin(options?)`** Fastify plugin that registers all auth routes
- **`auth.authRequired()`** `preHandler` hook that requires authentication, attaches `request.user`
- **`auth.authOptional()`** `preHandler` hook that optionally attaches `request.user`
- **`auth.requireRole(...roles)`** `preHandler` hook that checks `request.user.role`, returns 403 if not allowed. Must be used after `authRequired()`

### Routes

Same endpoints as the Express adapter:

| Method | Route | Body | Response |
|--------|-------|------|----------|
| POST | `/auth/register` | `{ email, password }` | `{ user, token }` |
| POST | `/auth/login` | `{ email, password }` | `{ user, token }` |
| POST | `/auth/logout` | - | `{ message }` |
| GET | `/auth/me` | - | `{ user }` |
| POST | `/auth/verify-email` | `{ token }` | `{ message }` |
| POST | `/auth/forgot-password` | `{ email }` | `{ message }` |
| POST | `/auth/reset-password` | `{ token, password }` | `{ message }` |
| POST | `/auth/invite` | `{ email, role? }` | `{ message }` |
| POST | `/auth/accept-invitation` | `{ token, password }` | `{ user, token }` |

### Role-Based Access Control

```ts
app.get('/admin', {
  preHandler: [auth.authRequired(), auth.requireRole('admin')]
}, async (request) => {
  return { message: 'Admin area' }
})
```

### Invitation

When the `'invitation'` feature is enabled, `POST /invite` (protected) and `POST /accept-invitation` (public) routes are automatically registered by the plugin.

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
