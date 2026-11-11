---
description: "Add registration, login, email verification and password reset to an Express + Prisma app with AuthCore, in under 10 minutes."
---

# Express: registration, email verification and password reset

Goal: an Express API with `register`, `login`, email verification and password reset, using Prisma and Resend. About 40 lines of your own code.

## 1. Install

```bash
pnpm add @authcore/express @authcore/prisma-adapter @authcore/resend-adapter @authcore/types
pnpm add @prisma/client express
pnpm add -D prisma
```

## 2. Add the schema

Copy the `User` and `Token` models from [Getting Started](/getting-started#database-setup) into `prisma/schema.prisma`, then:

```bash
npx prisma db push
```

## 3. Configure environment

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/myapp"
AUTH_SECRET="<output of: openssl rand -hex 32>"
RESEND_API_KEY="re_..."
```

## 4. Create the app

```ts
import express from 'express'
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { resendAdapter } from '@authcore/resend-adapter'
import { createAuth } from '@authcore/express'

const prisma = new PrismaClient()
const app = express()
app.use(express.json())

const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'auth@yourdomain.com',
  },
  features: ['emailVerification', 'passwordReset'],
})

app.use('/auth', auth.router({ baseUrl: 'http://localhost:3000' }))

app.get('/me', auth.middleware(), (req, res) => res.json({ user: req.user }))

app.listen(3000)
```

> `baseUrl` is the public URL of your **frontend** (or API) that the email links point at. Check the [Express integration](/integrations/express) page for the exact router options (`routes`, `useCookies`).

## 5. Try it

```bash
curl -X POST localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"me@example.com","password":"correct horse battery"}'
```

With `emailVerification` enabled, login is blocked until the user opens the link from the email and your frontend calls `POST /auth/verify-email` with the token. Password reset works the same way: `POST /auth/forgot-password` (always returns 200) and `POST /auth/reset-password`.

## What you did not have to write

Password hashing, token generation and hashing, token expiry (24h verify, 1h reset), enumeration-safe responses, input validation, and the email templates (customize them with [`email.templates`](/security/email-templates)).

## Next

[Add refresh tokens and cookies](/security/refresh-tokens) · [Add 2FA](/security/two-factor) · [Protect admin routes](/recipes/rbac-admin-routes)
