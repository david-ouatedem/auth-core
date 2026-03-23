# @authcore/express

> Express adapter for AuthCore. Drop-in auth routes and middleware.

## Install

```bash
npm install @authcore/express @authcore/prisma-adapter
```

## Usage

```ts
import express from 'express'
import { createAuth } from '@authcore/express'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const app = express()
app.use(express.json())

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})

// Mount auth routes
app.use('/auth', auth.router())

// Protect routes
app.get('/dashboard', auth.middleware(), (req, res) => {
  res.json({ user: req.user })
})

// Optional auth: req.user is set if token is valid, undefined otherwise
app.get('/public', auth.optionalMiddleware(), (req, res) => {
  res.json({ user: req.user ?? null })
})

app.listen(3000)
```

## API

### `createAuth(config)`

Creates an Express auth instance. See [`@authcore/core`](https://www.npmjs.com/package/@authcore/core) for the full config reference.

Returns:

- **`auth.router(options?)`** Express Router with all auth endpoints
- **`auth.middleware()`** Protects routes, attaches `req.user`, returns 401 if unauthenticated
- **`auth.optionalMiddleware()`** Attaches `req.user` if token is valid, doesn't reject unauthenticated requests
- **`auth.requireRole(...roles)`** Checks `req.user.role` against the allowed roles, returns 403 if not allowed. Must be used after `auth.middleware()`

### Router Options

```ts
auth.router({
  useCookies: false,       // set to true for httpOnly cookie auth (monorepo mode)
  cookieName: 'authcore_token',
  baseUrl: 'http://localhost:3000',  // used for building email verification/reset links
})
```

### Routes

When mounted at `/auth`:

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
// Protect a route so only admins can access it
app.get('/admin', auth.middleware(), auth.requireRole('admin'), (req, res) => {
  res.json({ message: 'Admin area' })
})

// Allow multiple roles
app.get('/staff', auth.middleware(), auth.requireRole('admin', 'editor'), (req, res) => {
  res.json({ message: 'Staff area' })
})
```

### Invitation

When the `'invitation'` feature is enabled, `POST /auth/invite` (protected) and `POST /auth/accept-invitation` (public) routes are automatically mounted. The invite route creates a user with the given role and sends an invitation email.

## With Email Verification & Password Reset

```ts
import { resendAdapter } from '@authcore/resend-adapter'

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'auth@yourdomain.com',
  },
  features: ['emailVerification', 'passwordReset'],
})
```

## License

[MIT](https://github.com/david-ouatedem/auth-core/blob/main/LICENSE)
