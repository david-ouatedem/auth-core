# AuthCore

> Devise-inspired, framework-agnostic authentication for Node.js.

[![npm](https://img.shields.io/npm/v/@authcore/core)](https://www.npmjs.com/package/@authcore/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

AuthCore gives you registration, login, logout, email verification, and password reset out of the box. Sensible defaults, zero magic, override anything.

## Packages

| Package | Description |
|---------|-------------|
| [`@authcore/types`](packages/types) | Shared type definitions for adapters, config, and domain models |
| [`@authcore/core`](packages/core) | Framework-agnostic auth logic and adapter interfaces |
| [`@authcore/core-web`](packages/core-web) | Framework-agnostic web auth service (HTTP client, session persistence) |
| [`@authcore/nextjs`](packages/nextjs) | Next.js App Router adapter (handler + server helpers + middleware) |
| [`@authcore/express`](packages/express) | Express router + middleware |
| [`@authcore/fastify`](packages/fastify) | Fastify plugin + hooks |
| [`@authcore/nestjs`](packages/nestjs) | NestJS module, guards, and decorators |
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
npm install @authcore/express @authcore/prisma-adapter @authcore/types
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
npm install @authcore/fastify @authcore/prisma-adapter @authcore/types
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

### Backend (NestJS)

```bash
npm install @authcore/nestjs @authcore/prisma-adapter @authcore/types
```

```ts
import { Module } from '@nestjs/common'
import { AuthModule } from '@authcore/nestjs'
import { prismaAdapter } from '@authcore/prisma-adapter'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

@Module({
  imports: [
    AuthModule.register({
      db: prismaAdapter(prisma),
      session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
    }),
  ],
})
export class AppModule {}
```

Protect routes with guards and decorators:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard, RolesGuard, Roles, CurrentUser } from '@authcore/nestjs'
import type { PublicUser } from '@authcore/nestjs'

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  @Get()
  getAdmin(@CurrentUser() user: PublicUser) {
    return { message: 'Admin area', user }
  }
}
```

### Frontend (React)

`@authcore/react` is built on top of `@authcore/core-web`, a framework-agnostic web auth service that handles HTTP communication and session persistence.

```bash
npm install @authcore/react @authcore/types
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
  const { user, isAuthenticated, isLoading, error, signIn, signUp, signOut } = useAuth()

  if (isLoading) return <p>Loading...</p>
  if (error) return <p>Error: {error}</p>
  if (!isAuthenticated) return <button onClick={() => signIn('user@example.com', 'password')}>Sign In</button>

  return (
    <div>
      <p>Hello, {user?.email}</p>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  )
}
```

If you need direct access to the web auth service without React, use `@authcore/core-web`:

```bash
npm install @authcore/core-web @authcore/types
```

```ts
import { AuthWebService } from '@authcore/core-web'

const auth = new AuthWebService({
  baseUrl: 'http://localhost:3000/auth',
  mode: 'api',
  persistSession: true,
  storageKey: 'authcore_token',
  user: null,
  token: '',
  isAuthenticated: false,
  isLoading: false,
  error: null,
})

await auth.signIn({ email: 'user@example.com', password: 'password' })
console.log(auth.getState().user)
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
    expiresIn: '15m',           // short-lived JWT; pair with refresh tokens
    refreshExpiresIn: '30d',    // refresh-token expiry (0.10+)
    cookieName: 'my_token',     // optional; default 'authcore_token'
    csrf: true,                 // opt-in CSRF protection in cookie mode (0.10+)
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

  // OAuth providers (0.11+)
  oauth: {
    google: createGoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  },
})
```

## API Endpoints

All endpoints are mounted under the prefix you choose (e.g. `/auth`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Create account, returns `{ user, token, refreshToken }` |
| POST | `/login` | Sign in, returns `{ user, token, refreshToken }` |
| POST | `/logout` | Sign out |
| GET | `/me` | Get current user (requires auth) |
| POST | `/verify-email` | Verify email with token |
| POST | `/forgot-password` | Request password reset email |
| POST | `/reset-password` | Reset password with token |
| POST | `/invite` | Invite a user by email (requires auth) |
| POST | `/accept-invitation` | Accept invitation, set password |
| POST | `/refresh` | Rotate refresh token, get new JWT (0.10+) |
| POST | `/revoke` | Revoke a refresh token, idempotent (0.10+) |
| GET | `/oauth/:provider` | Begin OAuth flow (0.11+) |
| GET | `/oauth/:provider/callback` | OAuth callback (0.11+) |

## RBAC

Every user has a `role` field (string, default `'user'`). The role is included in the JWT, so authorization checks don't need extra database lookups.

```ts
// Express
app.get('/admin', auth.middleware(), auth.requireRole('admin'), handler)

// Fastify
app.get('/admin', { preHandler: [auth.authRequired(), auth.requireRole('admin')] }, handler)

// NestJS
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
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

- Passwords hashed with bcryptjs (12+ rounds, silently clamped from below)
- Tokens are random (32 bytes), SHA-256 hashed before DB storage, compared with `crypto.timingSafeEqual`
- Password reset tokens expire in 1 hour, email verification in 24 hours, invitation tokens in 48 hours
- Forgot password always returns 200 (prevents email enumeration)
- All inputs validated with Zod
- Reset/verify/invite URLs are built by framework adapters from `baseUrl + paths.*`; the JWT signing secret never appears in outbound emails (see `CHANGELOG.md` 0.9 security entry for the affected-versions advisory)

## Development

```bash
git clone https://github.com/david-ouatedem/auth-core
cd auth-core
pnpm install
pnpm build     # builds all packages in dependency order (types → core/core-web → adapters/react)
pnpm test      # runs all tests
```

## License

[MIT](LICENSE)
