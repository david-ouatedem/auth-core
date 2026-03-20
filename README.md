# AuthCore

> Devise-inspired, framework-agnostic authentication for Node.js.

[![npm](https://img.shields.io/npm/v/@authcore/core)](https://www.npmjs.com/package/@authcore/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

AuthCore gives you registration, login, logout, email verification, and password reset out of the box. Sensible defaults, zero magic, override anything.

## Packages

| Package | Description |
|---------|-------------|
| [`@authcore/core`](packages/core) | Framework-agnostic auth logic, types, and adapter interfaces |
| [`@authcore/express`](packages/express) | Express router + middleware |
| [`@authcore/fastify`](packages/fastify) | Fastify plugin + hooks |
| [`@authcore/react`](packages/react) | React SDK: `AuthProvider`, `useAuth`, `ProtectedRoute` |
| [`@authcore/prisma-adapter`](packages/prisma-adapter) | Prisma database adapter |
| [`@authcore/resend-adapter`](packages/resend-adapter) | Resend email adapter |
| [`@authcore/nodemailer-adapter`](packages/nodemailer-adapter) | Nodemailer email adapter |
| [`create-authcore-app`](packages/create-authcore-app) | CLI scaffolding tool |

## Quick Start

```bash
npx create-authcore-app
```

Or set things up manually:

### Backend (Express)

```bash
npm install @authcore/express @authcore/prisma-adapter
```

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

// Mount all auth routes: /auth/register, /auth/login, /auth/logout, /auth/me, etc.
app.use('/auth', auth.router())

// Protect any route
app.get('/dashboard', auth.middleware(), (req, res) => {
  res.json({ user: req.user })
})

app.listen(3000)
```

### Backend (Fastify)

```bash
npm install @authcore/fastify @authcore/prisma-adapter
```

```ts
import Fastify from 'fastify'
import { createAuth } from '@authcore/fastify'
import { prismaAdapter } from '@authcore/prisma-adapter'

const app = Fastify()
const auth = createAuth({
  db: prismaAdapter(prisma),
  session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
})

await app.register(auth.plugin(), { prefix: '/auth' })

app.get('/dashboard', { preHandler: auth.authRequired() }, async (request) => {
  return { user: request.user }
})
```

### Frontend (React)

```bash
npm install @authcore/react
```

```tsx
import { AuthProvider, useAuth } from '@authcore/react'

function App() {
  return (
    <AuthProvider baseUrl="http://localhost:3000/auth" mode="api">
      <Main />
    </AuthProvider>
  )
}

function Main() {
  const { user, isAuthenticated, isLoading, signIn, signOut } = useAuth()

  if (isLoading) return <p>Loading...</p>
  if (!isAuthenticated) return <button onClick={() => signIn('user@example.com', 'password')}>Sign In</button>

  return (
    <div>
      <p>Hello, {user?.email}</p>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  )
}
```

## Environment Setup

Generate your `AUTH_SECRET` (used to sign JWTs):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or with openssl:

```bash
openssl rand -hex 32
```

Add it to your `.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/myapp"
AUTH_SECRET="your-generated-secret-here"
```

## Configuration

```ts
const auth = createAuth({
  // Required
  db: prismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    secret: process.env.AUTH_SECRET!,
    expiresIn: '7d',  // default
  },

  // Email (required for email verification + password reset)
  email: {
    provider: resendAdapter(process.env.RESEND_API_KEY!),
    from: 'auth@yourdomain.com',
  },

  // Enable features
  features: ['emailVerification', 'passwordReset', 'invitation'],

  // Password rules
  password: { minLength: 8 },

  // RBAC
  rbac: { defaultRole: 'user' },

  // Lifecycle callbacks
  callbacks: {
    onSignUp: (user) => console.log('New user:', user.email),
    onSignIn: (user) => console.log('Signed in:', user.email),
  },
})
```

## API Endpoints

All endpoints are mounted under the prefix you choose (e.g. `/auth`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Create account, returns `{ user, token }` |
| POST | `/login` | Sign in, returns `{ user, token }` |
| POST | `/logout` | Sign out |
| GET | `/me` | Get current user (requires auth) |
| POST | `/verify-email` | Verify email with token |
| POST | `/forgot-password` | Request password reset email |
| POST | `/reset-password` | Reset password with token |
| POST | `/invite` | Invite a user by email (requires auth) |
| POST | `/accept-invitation` | Accept invitation, set password |

## RBAC

Every user has a `role` field (string, default `'user'`). The role is included in the JWT, so authorization checks don't need extra database lookups.

```ts
// Express
app.get('/admin', auth.middleware(), auth.requireRole('admin'), handler)

// Fastify
app.get('/admin', { preHandler: [auth.authRequired(), auth.requireRole('admin')] }, handler)
```

## Invitation

Enable the `'invitation'` feature and configure an email provider. Authenticated users can invite new users by email with a pre-assigned role. The invited user receives a link to set their password.

```ts
// POST /auth/invite (requires auth)
// Body: { email: "new@user.com", role: "editor" }

// POST /auth/accept-invitation (public)
// Body: { token: "...", password: "securepass123" }
// Returns: { user, token }
```

## Data Model

AuthCore requires `User` and `Token` tables. With Prisma:

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  emailVerified Boolean  @default(false)
  role          String   @default("user")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  tokens        Token[]
}

model Token {
  id        String    @id @default(uuid())
  userId    String
  type      TokenType
  token     String    @unique
  expiresAt DateTime
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum TokenType {
  EMAIL_VERIFICATION
  PASSWORD_RESET
  SESSION
  INVITATION
}
```

## Adapters

AuthCore is database and email-provider agnostic. Implement the `DatabaseAdapter` or `EmailAdapter` interface from `@authcore/core` to add support for any provider.

**Database adapters:** [Prisma](packages/prisma-adapter)

**Email adapters:** [Resend](packages/resend-adapter) · [Nodemailer](packages/nodemailer-adapter)

See the [`@authcore/core` README](packages/core) for the adapter interfaces.

## Security

- Passwords hashed with bcryptjs (12+ rounds)
- Tokens are random, SHA-256 hashed before storage, compared with `crypto.timingSafeEqual`
- Password reset tokens expire in 1 hour, email verification in 24 hours, invitation tokens in 48 hours
- Forgot password always returns 200 (prevents email enumeration)
- All inputs validated with Zod

## Development

```bash
git clone https://github.com/david-ouatedem/auth-core
cd auth-core
pnpm install
pnpm build     # builds all packages in dependency order
pnpm test      # runs all tests
```

## License

[MIT](LICENSE)
